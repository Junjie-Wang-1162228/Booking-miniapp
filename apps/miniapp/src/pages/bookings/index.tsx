import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { cancelBooking, getMe, getMyBookings, getStoredToken, loginWithConfiguredAuth, setStoredBranchId } from '../../api';
import { resolveSelectedMemberBranch } from '../../branch-session';
import { AuthUser, Booking, MemberBranch } from '../../types';
import { formatTime } from '../../utils';
import { AppIcon } from '../../components/AppIcon';
import { BrandLogo } from '../../components/BrandLogo';
import './index.scss';

export default function BookingsPage() {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;

  async function ensureSession() {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      return { token: stored, user: await getMe(stored) };
    }
    const session = await loginWithConfiguredAuth();
    setToken(session.accessToken);
    return { token: session.accessToken, user: session.user };
  }

  async function load(preferredBranchId?: string) {
    setLoading(true);
    try {
      const session = await ensureSession();
      const branchSession = resolveSelectedMemberBranch(session.user, preferredBranchId);
      const data = branchSession.selectedBranchId ? await getMyBookings(session.token, branchSession.selectedBranchId) : [];
      setUser(session.user);
      setBranches(branchSession.accessibleBranches);
      setSelectedBranchId(branchSession.selectedBranchId);
      setBookings(data);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
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
      const data = await getMyBookings(token, branchId);
      setBookings(data);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '切换门店失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function cancel(item: Booking) {
    const result = await Taro.showModal({
      title: '取消预约？',
      content: `${item.boxingClass.title} ${formatTime(item.boxingClass.startsAt)}`,
      confirmText: '取消预约',
      confirmColor: '#e73535'
    });

    if (!result.confirm || !token) return;

    setLoading(true);
    try {
      await cancelBooking(token, item.id);
      Taro.showToast({ title: '已取消', icon: 'success' });
      await load(selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '取消失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    void load();
  });

  return (
    <View className="page">
      <View className="hero">
        <BrandLogo subLabel="MY BOOKINGS" />
        <Text className="title">我的预约</Text>
        <Text className="subtitle">
          {user ? `${user.displayName} · ${selectedBranch?.name ?? '当前门店'}` : '只显示当前登录会员自己的预约记录'}
        </Text>
      </View>

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

      <Text className="section-title">预约记录</Text>
      {bookings.length === 0 ? (
        <View className="empty">{loading ? '加载中...' : '暂无预约'}</View>
      ) : (
        bookings.map((item) => (
          <View className="card booking-card" key={item.id}>
            <View className="row">
              <View>
                <Text className="card-title">{item.boxingClass.title}</Text>
                <Text className="meta">{formatTime(item.boxingClass.startsAt)} · {item.boxingClass.coach}</Text>
              </View>
              <Text className={`pill ${item.status === 'BOOKED' ? 'red' : ''}`}>{item.status}</Text>
            </View>
            <View className="booking-footer">
              <Text className="meta">{item.attendanceStatus === 'ATTENDED' ? '已到课消课' : '待上课'}</Text>
              {item.canCancel && (
                <Button className="ghost-action" disabled={loading} onClick={() => void cancel(item)}>
                  <AppIcon name="cancel" />
                  取消预约
                </Button>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}
