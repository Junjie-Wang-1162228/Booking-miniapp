import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useState } from 'react';
import { cancelBooking, formatApiError, getMyBookings, getStoredToken, setStoredBranchId } from '../../api';
import { loadMemberSession } from '../../member-session';
import { attendanceStatusLabel, bookingStatusLabel } from '../../status-labels';
import { AuthUser, Booking, MemberBranch } from '../../types';
import { formatTime } from '../../utils';
import { AppIcon } from '../../components/AppIcon';
import { BrandLogo } from '../../components/BrandLogo';
import { LoadingCards, PageState } from '../../components/PageState';
import { useActionLock } from '../../use-action-lock';
import './index.scss';

const cancelBookingRuleText =
  '取消规则：开课前 2 小时以外可取消；截止后请联系拳馆工作人员处理。取消成功后会释放名额，并停止该预约的待发送提醒。';

export default function BookingsPage() {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { runLocked, isActionLocked } = useActionLock();
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;

  async function load(preferredBranchId?: string) {
    setLoading(true);
    setLoadError('');
    try {
      const session = await loadMemberSession({ token: getStoredToken(), preferredBranchId });
      const data = session.selectedBranchId ? await getMyBookings(session.token, session.selectedBranchId) : [];
      setToken(session.token);
      setUser(session.user);
      setBranches(session.branches);
      setSelectedBranchId(session.selectedBranchId);
      setBookings(data);
    } catch (error) {
      setLoadError(formatApiError(error, '预约加载失败'));
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
      const data = await getMyBookings(token, branchId);
      setBookings(data);
    } catch (error) {
      setLoadError(formatApiError(error, '门店预约加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function cancel(item: Booking) {
    const result = await Taro.showModal({
      title: '取消预约？',
      content: `${item.boxingClass.title}\n${formatTime(item.boxingClass.startsAt)}\n\n${cancelBookingRuleText}`,
      cancelText: '再想想',
      confirmText: '取消预约',
      confirmColor: '#e31b23'
    });

    if (!result.confirm || !token) return;

    setLoading(true);
    try {
      await cancelBooking(token, item.id);
      Taro.showToast({ title: '已取消', icon: 'success' });
      await load(selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '取消失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function refreshPage() {
    try {
      await load(selectedBranchId);
    } finally {
      Taro.stopPullDownRefresh();
    }
  }

  async function goToClasses() {
    await Taro.switchTab({
      url: '/pages/classes/index'
    });
  }

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void refreshPage();
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

      <Text className="section-title">预约记录</Text>
      {loading && bookings.length === 0 ? (
        <LoadingCards count={2} />
      ) : loadError ? (
        <PageState
          variant="error"
          title="预约加载失败"
          description={loadError}
          actionText="重新加载"
          onAction={() => load(selectedBranchId)}
        />
      ) : bookings.length === 0 ? (
        <PageState
          variant="empty"
          title="暂无预约"
          description="还没有预约记录，可先去约课页选择适合的训练课程。"
          actionText="去约课"
          onAction={goToClasses}
        />
      ) : (
        bookings.map((item) => (
          <View className="card booking-card" key={item.id}>
            <View className="row">
              <View className="card-main">
                <Text className="card-title">{item.boxingClass.title}</Text>
                <Text className="meta">{formatTime(item.boxingClass.startsAt)} · {item.boxingClass.coach}</Text>
              </View>
              <Text className={`pill ${item.status === 'BOOKED' ? 'red' : ''}`}>{bookingStatusLabel(item.status)}</Text>
            </View>
            <View className="booking-footer">
              <Text className="meta">{attendanceStatusLabel(item.attendanceStatus)}</Text>
              {item.canCancel && (
                <Button
                  className="ghost-action"
                  disabled={loading || isActionLocked('cancel:' + item.id)}
                  onClick={() => void runLocked('cancel:' + item.id, () => cancel(item))}
                >
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
