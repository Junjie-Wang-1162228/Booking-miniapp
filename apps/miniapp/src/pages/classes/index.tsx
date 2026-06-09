import { Button, Switch, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import {
  createBooking,
  devLogin,
  getClasses,
  getMe,
  getStoredMember,
  getStoredToken
} from '../../api';
import { AuthUser, BoxingClass, MemberKey } from '../../types';
import { formatTime } from '../../utils';
import './index.scss';

const memberNames: Record<MemberKey, string> = {
  'member-a': '阿杰',
  'member-b': '小林'
};

export default function ClassesPage() {
  const [member, setMember] = useState<MemberKey>(getStoredMember());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [classes, setClasses] = useState<BoxingClass[]>([]);
  const [reminder, setReminder] = useState(true);
  const [loading, setLoading] = useState(false);

  async function load(currentToken = token) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const [me, classList] = await Promise.all([getMe(currentToken), getClasses(currentToken)]);
      setUser(me);
      setClasses(classList);
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
      const classList = await getClasses(session.accessToken);
      setClasses(classList);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function bookClass(boxingClass: BoxingClass) {
    if (!token || boxingClass.remainingSpots <= 0) return;
    setLoading(true);
    try {
      await createBooking(token, boxingClass.id, reminder ? 120 : undefined);
      Taro.showToast({ title: '预约成功', icon: 'success' });
      await load(token);
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
      void switchMember(member);
    }
  });

  return (
    <View className="page classes-page">
      <View className="hero">
        <Text className="eyebrow">BOXING CLUB</Text>
        <Text className="title">今天想打哪节课？</Text>
        <Text className="subtitle">
          {user ? `${user.displayName} · 剩余 ${user.lessonBalance?.remaining ?? 0} 节课` : '选择会员后开始预约'}
        </Text>
      </View>

      <View className="member-switch">
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

      <View className="reminder-row">
        <View>
          <Text className="reminder-title">开课前 2 小时提醒</Text>
          <Text className="reminder-copy">需要微信订阅消息授权后发送</Text>
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
              {item.remainingSpots > 0 ? '立即预约' : '已满员'}
            </Button>
          </View>
        ))
      )}
    </View>
  );
}
