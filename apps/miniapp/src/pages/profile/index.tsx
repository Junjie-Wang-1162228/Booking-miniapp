import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useState } from 'react';
import {
  accountLogin,
  clearStoredSession,
  getMyDeductions,
  formatApiError,
  getStoredMember,
  getStoredToken,
  isDevAuthMode,
  setStoredBranchId,
  wechatLogin
} from '../../api';
import { developmentMembers, loadMemberSession, memberNames, switchDevelopmentMember } from '../../member-session';
import { AuthUser, Deduction, MemberBranch, MemberKey } from '../../types';
import { formatTime } from '../../utils';
import { AppIcon } from '../../components/AppIcon';
import { BrandLogo } from '../../components/BrandLogo';
import { LoadingCards, PageState } from '../../components/PageState';
import { useActionLock } from '../../use-action-lock';
import './index.scss';

const privacyPolicyText =
  '我们仅为约课、门店权限、课时余额、消课记录和微信账号绑定处理必要信息，包括姓名、手机号、会员号、当前小程序 openid、预约记录、课时记录和订阅消息状态。不收集身份证、精确定位、通讯录、相册、麦克风、摄像头或与约课无关的信息。';

const bookingRulesText =
  '预约成功后会占用课程名额；课时按当前门店独立计算，暂不支持跨门店通用课包。开课前 2 小时以外可在“我的”页面取消预约，截止后或爽约请联系拳馆工作人员处理；如按馆规扣课，由管理员确认消课，误扣可通过课时调整纠正。课程取消时，系统会同步取消有效预约并停止待发送提醒。';

export default function ProfilePage() {
  const [member, setMember] = useState<MemberKey>(getStoredMember());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const { runLocked, isActionLocked } = useActionLock();
  const devAuthMode = isDevAuthMode();
  const canOpenOps = user?.role === 'ADMIN' && branches.length > 0;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const selectedBalance = selectedBranch?.lessonBalance?.remaining ?? user?.lessonBalance?.remaining ?? 0;
  const phoneText = user?.phone || '未登记';
  const memberNoText = selectedBranch?.memberNo || '未登记';
  const branchNameText = selectedBranch?.name || '未选择门店';
  const roleText = user?.role === 'ADMIN' ? selectedBranch?.staffRole || 'ADMIN' : '会员';
  const profileTrainingMeta = user
    ? user.role === 'ADMIN'
      ? `${roleText} · 管理当前门店课程和会员`
      : `剩余 ${selectedBalance} 节课 · 课时按门店独立计算`
    : '微信授权或账号登录后查看课时、预约和门店服务';

  function clearProfileSession() {
    setToken('');
    setUser(null);
    setBranches([]);
    setSelectedBranchId('');
    setDeductions([]);
  }

  async function load(currentToken = token, preferredBranchId?: string) {
    if (!currentToken && !devAuthMode) {
      clearProfileSession();
      return;
    }

    setLoading(true);
    setLoadError('');
    setLoginError('');
    try {
      const session = await loadMemberSession({ token: currentToken, member, preferredBranchId });
      const deductionList = session.user.role !== 'ADMIN' && session.selectedBranchId
        ? await getMyDeductions(session.token, session.selectedBranchId)
        : [];
      setToken(session.token);
      setUser(session.user);
      setBranches(session.branches);
      setSelectedBranchId(session.selectedBranchId);
      setDeductions(deductionList);
    } catch (error) {
      setLoadError(formatApiError(error, '会员信息加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function submitWechatLogin() {
    setLoading(true);
    setLoadError('');
    setLoginError('');
    try {
      const session = await wechatLogin();
      await load(session.accessToken);
    } catch (error) {
      setLoginError(formatApiError(error, '微信授权登录失败'));
    } finally {
      setLoading(false);
    }
  }

  async function submitAccountLogin() {
    const username = loginUsername.trim();
    const password = loginPassword.trim();
    if (!username || !password) {
      setLoginError('请输入账号和密码');
      return;
    }

    setLoading(true);
    setLoadError('');
    setLoginError('');
    try {
      const session = await accountLogin(username, password);
      setLoginPassword('');
      await load(session.accessToken);
    } catch (error) {
      setLoginError(formatApiError(error, '账号或密码错误'));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    clearStoredSession();
    clearProfileSession();
    setLoginPassword('');
    setLoadError('');
    setLoginError('');
  }

  async function switchMember(nextMember: MemberKey) {
    setLoading(true);
    setLoadError('');
    try {
      const session = await switchDevelopmentMember(nextMember);
      const deductionList = session.user.role !== 'ADMIN' && session.selectedBranchId
        ? await getMyDeductions(session.token, session.selectedBranchId)
        : [];
      setMember(nextMember);
      setToken(session.token);
      setUser(session.user);
      setBranches(session.branches);
      setSelectedBranchId(session.selectedBranchId);
      setDeductions(deductionList);
    } catch (error) {
      setLoadError(formatApiError(error, '会员切换失败'));
    } finally {
      setLoading(false);
    }
  }

  async function switchBranch(branchId: string) {
    if (!token || branchId === selectedBranchId) return;
    setStoredBranchId(branchId);
    setSelectedBranchId(branchId);
    setLoading(true);
    setLoadError('');
    try {
      const deductionList = user?.role === 'ADMIN' ? [] : await getMyDeductions(token, branchId);
      setDeductions(deductionList);
    } catch (error) {
      setLoadError(formatApiError(error, '消课记录加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function openPrivacyPolicy() {
    await Taro.showModal({
      title: '隐私政策',
      content: privacyPolicyText,
      confirmText: '知道了',
      showCancel: false
    });
  }

  async function openBookingRules() {
    await Taro.showModal({
      title: '约课规则',
      content: bookingRulesText,
      confirmText: '知道了',
      showCancel: false
    });
  }

  async function contactSupport() {
    if (selectedBranch?.phone) {
      await Taro.makePhoneCall({
        phoneNumber: selectedBranch.phone
      });
      return;
    }

    await Taro.showModal({
      title: '联系客服',
      content: '当前门店暂未配置电话。预约问题、取消异常、课时疑问请到店咨询工作人员，或查看门店公告中的联系方式。',
      confirmText: '知道了',
      showCancel: false
    });
  }

  async function openOps() {
    await Taro.navigateTo({
      url: '/pages/ops/index'
    });
  }

  async function refreshPage() {
    try {
      await load(getStoredToken(), selectedBranchId);
    } finally {
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => {
    const stored = getStoredToken();
    setToken(stored);
    if (stored || devAuthMode) {
      void load(stored);
    } else {
      clearProfileSession();
    }
  });

  usePullDownRefresh(() => {
    void refreshPage();
  });

  return (
    <View className="page profile-page">
      <View className="hero">
        <BrandLogo subLabel="MEMBER CENTER" />
        <Text className="title">{user?.displayName || memberNames[member]}</Text>
        <Text className="subtitle">
          {selectedBranch?.name ?? '当前门店'} · {user?.role === 'ADMIN' ? '运营管理' : `剩余课时 ${selectedBalance} 节`}
        </Text>
        <View className="hero__brand-line">
          <Text className="mat-lane" />
          <Text>会员课时 · 运营权限 · 场馆联系</Text>
        </View>
      </View>

      <View className="training-strip profile-training-strip">
        <View className="training-strip__track">
          <Text className="training-strip__lane" />
          <Text className="training-strip__dot training-strip__dot-a" />
          <Text className="training-strip__dot training-strip__dot-b" />
        </View>
        <View className="training-strip__content">
          <Text className="training-strip__eyebrow">账户状态</Text>
          <Text className="training-strip__title">{branchNameText}</Text>
          <Text className="training-strip__meta">{profileTrainingMeta}</Text>
        </View>
      </View>

      {!devAuthMode && !user && (
        <View className="account-login-panel">
          <View className="notice-title-row">
            <AppIcon name="account" />
            <Text className="notice-title">登录方式</Text>
          </View>
          <Text className="notice-copy">会员使用微信授权登录；运营测试账号可使用账号登录。</Text>
          <View className="login-methods">
            <Button
              className="login-method primary"
              disabled={loading || isActionLocked('wechat-login')}
              onClick={() => void runLocked('wechat-login', submitWechatLogin)}
            >
              微信授权登录
            </Button>
          </View>
          <View className="account-login-form">
            <Input
              className="account-input"
              value={loginUsername}
              placeholder="账号：admin 或 test"
              maxlength={32}
              onInput={(event) => setLoginUsername(String(event.detail.value || ''))}
            />
            <Input
              className="account-input"
              value={loginPassword}
              password
              placeholder="密码"
              maxlength={64}
              onInput={(event) => setLoginPassword(String(event.detail.value || ''))}
            />
            <Button
              className="login-method"
              disabled={loading || isActionLocked('account-login')}
              onClick={() => void runLocked('account-login', submitAccountLogin)}
            >
              账号登录
            </Button>
          </View>
          {loginError && <Text className="login-error">{loginError}</Text>}
        </View>
      )}

      {devAuthMode && (
        <View className="member-switch profile-switch">
          {developmentMembers.map((key) => (
            <Button
              key={key}
              className={`member-button ${member === key ? 'active' : ''}`}
              disabled={loading || isActionLocked('switch-member:' + key)}
              onClick={() => void runLocked('switch-member:' + key, () => switchMember(key))}
            >
              <AppIcon name="member" />
              {memberNames[key]}
            </Button>
          ))}
        </View>
      )}

      {branches.length > 0 && (
        <View className="branch-selector">
          {branches.length > 1 ? (
            branches.map((branch) => (
              <Button
                key={branch.id}
                className={`branch-button ${selectedBranchId === branch.id ? 'active' : ''}`}
                disabled={loading || isActionLocked('switch-branch:' + branch.id)}
                onClick={() => void runLocked('switch-branch:' + branch.id, () => switchBranch(branch.id))}
              >
                <AppIcon name="branch" />
                {branch.name}
              </Button>
            ))
          ) : (
            <View className="branch-single">
              <AppIcon name="branch" />
              <Text>{branches[0].name}</Text>
            </View>
          )}
        </View>
      )}

      {user && (
        <View className="profile-summary">
          <View className="notice-title-row">
            <AppIcon name="account" />
            <Text className="notice-title">会员资料</Text>
          </View>
          <View className="profile-summary__grid">
            <View className="profile-summary__item">
              <Text className="profile-summary__label">手机号</Text>
              <Text className="profile-summary__value">{phoneText}</Text>
            </View>
            <View className="profile-summary__item">
              <Text className="profile-summary__label">{user.role === 'ADMIN' ? '运营角色' : '会员编号'}</Text>
              <Text className="profile-summary__value">{user.role === 'ADMIN' ? roleText : memberNoText}</Text>
            </View>
            <View className="profile-summary__item">
              <Text className="profile-summary__label">当前门店</Text>
              <Text className="profile-summary__value">{branchNameText}</Text>
            </View>
            <View className="profile-summary__item">
              <Text className="profile-summary__label">{user.role === 'ADMIN' ? '操作范围' : '剩余课时'}</Text>
              <Text className="profile-summary__value">{user.role === 'ADMIN' ? '当前门店' : `${selectedBalance} 节`}</Text>
            </View>
          </View>
        </View>
      )}

      {user && (
        <Button
          className="logout-action"
          disabled={isActionLocked('logout')}
          onClick={() => void runLocked('logout', logout)}
        >
          退出登录
        </Button>
      )}

      {canOpenOps && (
        <Button
          className="ops-entry"
          disabled={isActionLocked('open-ops')}
          onClick={() => void runLocked('open-ops', openOps)}
        >
          <View className="ops-entry__main">
            <AppIcon name="calendar" />
            <View className="ops-entry__copy">
              <Text className="ops-entry__title">运营管理</Text>
              <Text className="ops-entry__meta">排课、名单、消课和会员绑定</Text>
            </View>
          </View>
          <Text className="ops-entry__arrow">›</Text>
        </Button>
      )}

      {devAuthMode && (
        <View className="notice-card">
          <View className="notice-title-row">
            <AppIcon name="account" />
            <Text className="notice-title">开发会员体验模式</Text>
          </View>
          <Text className="notice-copy">当前可切换测试会员，正式微信登录不会显示这张提示卡。</Text>
        </View>
      )}

      <Text className="section-title">规则与隐私</Text>
      <View className="compliance-list">
        <Button
          className="compliance-action"
          disabled={isActionLocked('privacy-policy')}
          onClick={() => void runLocked('privacy-policy', openPrivacyPolicy)}
        >
          <View className="compliance-action__main">
            <AppIcon name="account" />
            <View className="compliance-action__copy">
              <Text className="compliance-action__title">隐私政策</Text>
              <Text className="compliance-action__meta">查看数据用途和不收集范围</Text>
            </View>
          </View>
          <Text className="compliance-action__arrow">›</Text>
        </Button>
        <Button
          className="compliance-action"
          disabled={isActionLocked('booking-rules')}
          onClick={() => void runLocked('booking-rules', openBookingRules)}
        >
          <View className="compliance-action__main">
            <AppIcon name="check" />
            <View className="compliance-action__copy">
              <Text className="compliance-action__title">约课规则</Text>
              <Text className="compliance-action__meta">取消截止、门店课时和爽约说明</Text>
            </View>
          </View>
          <Text className="compliance-action__arrow">›</Text>
        </Button>
        <Button
          className="compliance-action"
          disabled={isActionLocked('contact-support')}
          onClick={() => void runLocked('contact-support', contactSupport)}
        >
          <View className="compliance-action__main">
            <AppIcon name="branch" />
            <View className="compliance-action__copy">
              <Text className="compliance-action__title">联系客服</Text>
              <Text className="compliance-action__meta">
                {selectedBranch?.phone ? `${selectedBranch.name} ${selectedBranch.phone}` : '预约问题、取消异常、课时疑问'}
              </Text>
            </View>
          </View>
          <Text className="compliance-action__arrow">›</Text>
        </Button>
      </View>

      {user && user.role !== 'ADMIN' && (
        <>
          <Text className="section-title">消课记录</Text>
          {loading && deductions.length === 0 ? (
            <LoadingCards count={2} />
          ) : loadError ? (
            <PageState
              variant="error"
              title="记录加载失败"
              description={loadError}
              actionText="重新加载"
              onAction={() => load(token, selectedBranchId)}
            />
          ) : deductions.length === 0 ? (
            <PageState
              variant="empty"
              title="暂无消课记录"
              description="到店上课并由管理员确认后，记录会出现在这里。"
              actionText="刷新记录"
              onAction={() => load(token, selectedBranchId)}
            />
          ) : (
            deductions.map((item) => (
              <View className="card deduction-card" key={item.id}>
                <View className="row">
                  <View className="card-main">
                    <Text className="card-title">{item.boxingClass.title}</Text>
                    <Text className="meta">{formatTime(item.createdAt)} · {item.boxingClass.coach}</Text>
                  </View>
                  <Text className="pill red">-{item.amount}</Text>
                </View>
                <Text className="meta">{item.note || '管理员已确认到课'}</Text>
              </View>
            ))
          )}
        </>
      )}
    </View>
  );
}
