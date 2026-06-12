import { Button, Switch, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import {
  createBooking,
  devLogin,
  getClasses,
  getMe,
  getStoredMember,
  getStoredToken,
  isDevAuthMode,
  loginWithConfiguredAuth,
  setStoredBranchId
} from '../../api';
import { resolveSelectedMemberBranch } from '../../branch-session';
import { AuthResponse, AuthUser, BoxingClass, MemberBranch, MemberKey } from '../../types';
import { formatTime } from '../../utils';
import { AppIcon } from '../../components/AppIcon';
import { BrandLogo } from '../../components/BrandLogo';
import './index.scss';

const memberNames: Record<MemberKey, string> = {
  'member-a': '阿杰',
  'member-b': '小林',
  'member-c': '东店同学'
};

const developmentMembers: MemberKey[] = ['member-a', 'member-b', 'member-c'];

export default function ClassesPage() {
  const [member, setMember] = useState<MemberKey>(getStoredMember());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [classes, setClasses] = useState<BoxingClass[]>([]);
  const [reminder, setReminder] = useState(true);
  const [loading, setLoading] = useState(false);
  const devAuthMode = isDevAuthMode();
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const selectedBalance = selectedBranch?.lessonBalance.remaining ?? user?.lessonBalance?.remaining ?? 0;

  async function load(currentToken = token, preferredBranchId?: string) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const me = await getMe(currentToken);
      const branchSession = resolveSelectedMemberBranch(me, preferredBranchId);
      const classList = branchSession.selectedBranchId ? await getClasses(currentToken, branchSession.selectedBranchId) : [];
      setUser(me);
      setBranches(branchSession.accessibleBranches);
      setSelectedBranchId(branchSession.selectedBranchId);
      setClasses(classList);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function applySession(session: AuthResponse) {
    setToken(session.accessToken);
    setUser(session.user);
    const branchSession = resolveSelectedMemberBranch(session.user);
    const classList = branchSession.selectedBranchId ? await getClasses(session.accessToken, branchSession.selectedBranchId) : [];
    setBranches(branchSession.accessibleBranches);
    setSelectedBranchId(branchSession.selectedBranchId);
    setClasses(classList);
  }

  async function startSession() {
    setLoading(true);
    try {
      const session = await loginWithConfiguredAuth(member);
      await applySession(session);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function switchMember(nextMember: MemberKey) {
    setLoading(true);
    try {
      const session = await devLogin(nextMember);
      setMember(nextMember);
      await applySession(session);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function switchBranch(branchId: string) {
    if (!token || branchId === selectedBranchId) return;
    setStoredBranchId(branchId);
    setSelectedBranchId(branchId);
    setLoading(true);
    try {
      const classList = await getClasses(token, branchId);
      setClasses(classList);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '切换门店失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function bookClass(boxingClass: BoxingClass) {
    if (!token || !selectedBranchId || boxingClass.remainingSpots <= 0) return;
    setLoading(true);
    try {
      await createBooking(token, boxingClass.id, selectedBranchId, reminder ? 120 : undefined);
      Taro.showToast({ title: '预约成功', icon: 'success' });
      await load(token, selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '预约失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      void load(stored);
    } else {
      void startSession();
    }
  });

  return (
    <View className="page classes-page">
      <View className="hero">
        <BrandLogo />
        <Text className="title">今天想打哪节课？</Text>
        <Text className="subtitle">
          {user
            ? `${user.displayName} · ${selectedBranch?.name ?? '当前门店'} · 剩余 ${selectedBalance} 节课`
            : '选择会员后开始预约'}
        </Text>
      </View>

      {devAuthMode && (
        <View className="member-switch">
          {developmentMembers.map((key) => (
            <Button
              key={key}
              className={`member-button ${member === key ? 'active' : ''}`}
              disabled={loading}
              onClick={() => void switchMember(key)}
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
                disabled={loading}
                onClick={() => void switchBranch(branch.id)}
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

      <View className="reminder-row">
        <View className="reminder-copy-wrap">
          <AppIcon name="bell" />
          <View>
            <Text className="reminder-title">开课前 2 小时提醒</Text>
            <Text className="reminder-copy">需要微信订阅消息授权后发送</Text>
          </View>
        </View>
        <Switch checked={reminder} color="#e73535" onChange={(event) => setReminder(event.detail.value)} />
      </View>

      <Text className="section-title">可预约课程</Text>
      {classes.length === 0 ? (
        <View className="empty">{loading ? '加载中...' : '暂无可预约课程'}</View>
      ) : (
        classes.map((item) => (
          <View className="card class-card" key={item.id}>
            <View className="row">
              <View>
                <Text className="card-title">{item.title}</Text>
                <Text className="meta">{formatTime(item.startsAt)} · {item.coach}</Text>
              </View>
              <Text className={`pill ${item.remainingSpots > 0 ? 'red' : ''}`}>
                {item.remainingSpots}/{item.capacity}
              </Text>
            </View>
            <Text className="class-description">{item.description}</Text>
            <Button
              className="primary-action"
              disabled={loading || item.remainingSpots <= 0}
              onClick={() => void bookClass(item)}
            >
              <AppIcon name={item.remainingSpots > 0 ? 'calendar' : 'cancel'} />
              {item.remainingSpots > 0 ? '立即预约' : '已满员'}
            </Button>
          </View>
        ))
      )}
    </View>
  );
}
