import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { devLogin, getMe, getMyDeductions, getStoredMember, getStoredToken } from '../../api';
import { AuthUser, Deduction, MemberKey } from '../../types';
import { formatTime } from '../../utils';
import './index.scss';

const memberNames: Record<MemberKey, string> = {
  'member-a': '阿杰',
  'member-b': '小林'
};

export default function ProfilePage() {
  const [member, setMember] = useState<MemberKey>(getStoredMember());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(currentToken = token) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const [me, deductionList] = await Promise.all([getMe(currentToken), getMyDeductions(currentToken)]);
      setUser(me);
      setDeductions(deductionList);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function switchMember(nextMember: MemberKey) {
    setLoading(true);
    try {
      const session = await devLogin(nextMember);
      setMember(nextMember);
      setToken(session.accessToken);
      setUser(session.user);
      const deductionList = await getMyDeductions(session.accessToken);
      setDeductions(deductionList);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '切换失败', icon: 'none' });
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
      void switchMember(member);
    }
  });

  return (
    <View className="page profile-page">
      <View className="hero">
        <Text className="eyebrow">MEMBER</Text>
        <Text className="title">{user?.displayName || memberNames[member]}</Text>
        <Text className="subtitle">剩余课时 {user?.lessonBalance?.remaining ?? 0} 节</Text>
      </View>

      <View className="member-switch profile-switch">
        {(['member-a', 'member-b'] as MemberKey[]).map((key) => (
          <Button
            key={key}
            className={`member-button ${member === key ? 'active' : ''}`}
            disabled={loading}
            onClick={() => void switchMember(key)}
          >
            {memberNames[key]}
          </Button>
        ))}
      </View>

      <View className="notice-card">
        <Text className="notice-title">MVP 体验账号</Text>
        <Text className="notice-copy">正式上线时应切换到拳馆主体小程序，当前页面用于验证多用户数据隔离。</Text>
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
