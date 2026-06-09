import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { cancelBooking, devLogin, getMyBookings, getStoredMember, getStoredToken } from '../../api';
import { Booking } from '../../types';
import { formatTime } from '../../utils';
import './index.scss';

export default function BookingsPage() {
  const [token, setToken] = useState(getStoredToken());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  async function ensureToken() {
    const stored = getStoredToken();
    if (stored) {
      setToken(stored);
      return stored;
    }
    const session = await devLogin(getStoredMember());
    setToken(session.accessToken);
    return session.accessToken;
  }

  async function load() {
    setLoading(true);
    try {
      const currentToken = await ensureToken();
      const data = await getMyBookings(currentToken);
      setBookings(data);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' });
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
      await load();
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
        <Text className="eyebrow">MY BOOKINGS</Text>
        <Text className="title">我的预约</Text>
        <Text className="subtitle">只显示当前登录会员自己的预约记录</Text>
      </View>

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
