import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import {
  devLogin,
  getMe,
  getMyDeductions,
  getStoredMember,
  getStoredToken,
  isDevAuthMode,
  loginWithConfiguredAuth,
  setStoredBranchId
} from '../../api';
import { resolveSelectedMemberBranch } from '../../branch-session';
import { AuthResponse, AuthUser, Deduction, MemberBranch, MemberKey } from '../../types';
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

export default function ProfilePage() {
  const [member, setMember] = useState<MemberKey>(getStoredMember());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [deductions, setDeductions] = useState<Deduction[]>([]);
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
      const deductionList = branchSession.selectedBranchId
        ? await getMyDeductions(currentToken, branchSession.selectedBranchId)
        : [];
      setUser(me);
      setBranches(branchSession.accessibleBranches);
      setSelectedBranchId(branchSession.selectedBranchId);
      setDeductions(deductionList);
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
    const deductionList = branchSession.selectedBranchId
      ? await getMyDeductions(session.accessToken, branchSession.selectedBranchId)
      : [];
    setBranches(branchSession.accessibleBranches);
    setSelectedBranchId(branchSession.selectedBranchId);
    setDeductions(deductionList);
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
      Taro.showToast({ title: error instanceof Error ? error.message : '切换失败', icon: 'none' });
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
      const deductionList = await getMyDeductions(token, branchId);
      setDeductions(deductionList);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '切换门店失败', icon: 'none' });
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
    <View className="page profile-page">
      <View className="hero">
        <BrandLogo subLabel="MEMBER CENTER" />
        <Text className="title">{user?.displayName || memberNames[member]}</Text>
        <Text className="subtitle">
          {selectedBranch?.name ?? '当前门店'} · 剩余课时 {selectedBalance} 节
        </Text>
      </View>

      {devAuthMode && (
        <View className="member-switch profile-switch">
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

      <View className="notice-card">
        <View className="notice-title-row">
          <AppIcon name="account" />
          <Text className="notice-title">微信账号体验模式</Text>
        </View>
        <Text className="notice-copy">当前会员按微信 openid 隔离，首次进入会自动分配测试门店和课时。</Text>
      </View>

      <Text className="section-title">消课记录</Text>
      {deductions.length === 0 ? (
        <View className="empty">{loading ? '加载中...' : '暂无消课记录'}</View>
      ) : (
        deductions.map((item) => (
          <View className="card deduction-card" key={item.id}>
            <View className="row">
              <View>
                <Text className="card-title">{item.boxingClass.title}</Text>
                <Text className="meta">{formatTime(item.createdAt)} · {item.boxingClass.coach}</Text>
              </View>
              <Text className="pill red">-{item.amount}</Text>
            </View>
            <Text className="meta">{item.note || '管理员已确认到课'}</Text>
          </View>
        ))
      )}
    </View>
  );
}
