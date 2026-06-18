import { Button, ScrollView, Switch, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useState } from 'react';
import {
  createBooking,
  formatApiError,
  getStoredMember,
  getStoredToken,
  isDevAuthMode,
  requestBookingSubscriptions,
  setStoredBranchId
} from '../../api';
import { developmentMembers, loadMemberSession, memberNames, switchDevelopmentMember } from '../../member-session';
import { AuthUser, BoxingClass, MemberBranch, MemberKey } from '../../types';
import { loadVisibleClasses } from '../../visible-classes';
import { formatTime } from '../../utils';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import { BrandLogo } from '../../components/BrandLogo';
import { LoadingCards, PageState } from '../../components/PageState';
import { filterBookableClasses } from '../../class-availability';
import { useActionLock } from '../../use-action-lock';
import './index.scss';

function getClassAction(
  boxingClass: BoxingClass,
  userRole?: AuthUser['role']
): { disabled: boolean; icon: AppIconName; label: string; variant: string } {
  if (userRole === 'ADMIN') {
    return { disabled: true, icon: 'calendar', label: '运营查看', variant: 'is-admin' };
  }

  if (boxingClass.isBookedByMe) {
    return { disabled: true, icon: 'check', label: '已预约', variant: 'is-booked' };
  }

  if (boxingClass.remainingSpots <= 0) {
    return { disabled: true, icon: 'cancel', label: '已满员', variant: 'is-full' };
  }

  return { disabled: false, icon: 'calendar', label: '立即预约', variant: 'is-open' };
}

function getClassTrainingTag(boxingClass: BoxingClass) {
  const text = `${boxingClass.title} ${boxingClass.description}`;
  if (/新手|基础|入门/.test(text)) return '新手友好';
  if (/体能|燃脂|核心|力量/.test(text)) return '燃脂体能';
  if (/实战|对抗|拳靶/.test(text)) return '实战进阶';
  return '综合训练';
}

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getClassDateKey(startsAt: string) {
  const classDate = new Date(startsAt);
  const month = `${classDate.getMonth() + 1}`.padStart(2, '0');
  const day = `${classDate.getDate()}`.padStart(2, '0');
  return `${classDate.getFullYear()}-${month}-${day}`;
}

function getClassDateGroupLabel(startsAt: string, now = new Date()) {
  const classDate = new Date(startsAt);
  const dayDiff = (getLocalDayStart(classDate) - getLocalDayStart(now)) / 86400000;

  if (dayDiff === 0) return '今天';
  if (dayDiff === 1) return '明天';
  if (dayDiff > 1 && dayDiff < 7) return '本周';

  const month = `${classDate.getMonth() + 1}`.padStart(2, '0');
  const day = `${classDate.getDate()}`.padStart(2, '0');
  return `${month}月${day}日`;
}

function groupClassesByDate(classList: BoxingClass[]) {
  return classList.reduce<Array<{ label: string; classes: BoxingClass[] }>>((groups, item) => {
    const label = getClassDateGroupLabel(item.startsAt);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.label === label) {
      currentGroup.classes.push(item);
      return groups;
    }

    groups.push({ label, classes: [item] });
    return groups;
  }, []);
}

function createClassDateFilters(classList: BoxingClass[]) {
  const filters = new Map<string, { key: string; label: string; count: number }>();

  classList.forEach((item) => {
    const key = getClassDateKey(item.startsAt);
    const current = filters.get(key);

    if (current) {
      current.count += 1;
      return;
    }

    filters.set(key, {
      key,
      label: getClassDateGroupLabel(item.startsAt),
      count: 1
    });
  });

  return [{ key: 'all', label: '全部', count: classList.length }, ...filters.values()];
}

export default function ClassesPage() {
  const [member, setMember] = useState<MemberKey>(getStoredMember());
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [classes, setClasses] = useState<BoxingClass[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState('all');
  const [reminder, setReminder] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { runLocked, isActionLocked } = useActionLock();
  const devAuthMode = isDevAuthMode();
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const selectedBalance = selectedBranch?.lessonBalance?.remaining ?? user?.lessonBalance?.remaining ?? 0;
  const venueAddress = selectedBranch?.address || '灰色训练垫区 · 橙色落点 · 沙袋训练';
  const venueContact = selectedBranch?.phone || '到店前可联系拳馆确认课程';
  const dateFilters = createClassDateFilters(classes);
  const filteredClasses =
    selectedDateKey === 'all' ? classes : classes.filter((item) => getClassDateKey(item.startsAt) === selectedDateKey);
  const groupedClasses = groupClassesByDate(filteredClasses);

  function applyLoadedClasses(classList: BoxingClass[]) {
    const bookableClasses = filterBookableClasses(classList);
    setClasses(bookableClasses);

    if (
      selectedDateKey !== 'all' &&
      !bookableClasses.some((item) => getClassDateKey(item.startsAt) === selectedDateKey)
    ) {
      setSelectedDateKey('all');
    }
  }

  async function load(currentToken = token, preferredBranchId?: string) {
    setLoading(true);
    setLoadError('');
    try {
      const session = await loadMemberSession({ token: currentToken, member, preferredBranchId });
      const classList = session.selectedBranchId ? await loadVisibleClasses(session, session.selectedBranchId) : [];
      setToken(session.token);
      setUser(session.user);
      setBranches(session.branches);
      setSelectedBranchId(session.selectedBranchId);
      applyLoadedClasses(classList);
    } catch (error) {
      setLoadError(formatApiError(error, '课程加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function switchMember(nextMember: MemberKey) {
    setLoading(true);
    setLoadError('');
    try {
      const session = await switchDevelopmentMember(nextMember);
      const classList = session.selectedBranchId ? await loadVisibleClasses(session, session.selectedBranchId) : [];
      setMember(nextMember);
      setToken(session.token);
      setUser(session.user);
      setBranches(session.branches);
      setSelectedBranchId(session.selectedBranchId);
      applyLoadedClasses(classList);
    } catch (error) {
      setLoadError(formatApiError(error, '会员切换失败'));
    } finally {
      setLoading(false);
    }
  }

  async function switchBranch(branchId: string) {
    if (!token || !user || branchId === selectedBranchId) return;
    setStoredBranchId(branchId);
    setSelectedBranchId(branchId);
    setLoading(true);
    setLoadError('');
    try {
      const classList = await loadVisibleClasses(
        {
          token,
          user,
          branches,
          selectedBranchId: branchId,
          selectedBranch: branches.find((branch) => branch.id === branchId) ?? null
        },
        branchId
      );
      applyLoadedClasses(classList);
    } catch (error) {
      setLoadError(formatApiError(error, '门店课程加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function showBookingSuccessModal(reminderEnabled: boolean, remindBeforeMinutes?: number) {
    const result = await Taro.showModal({
      title: '预约成功',
      content: reminderEnabled && !remindBeforeMinutes ? '已完成预约。本次未开启课前提醒，可在“我的预约”查看记录。' : '已完成预约，可在“我的预约”查看记录。',
      confirmText: '查看预约',
      cancelText: '继续约课',
      confirmColor: '#e31b23'
    });

    if (result.confirm) {
      await Taro.switchTab({
        url: '/pages/bookings/index'
      });
    }
  }

  async function showClassDetail(boxingClass: BoxingClass) {
    const branchId = boxingClass.branchId || selectedBranchId;
    await Taro.navigateTo({
      url: `/pages/class-detail/index?id=${encodeURIComponent(boxingClass.id)}&branchId=${encodeURIComponent(branchId)}`
    });
  }

  async function bookClass(boxingClass: BoxingClass) {
    if (!token || !selectedBranchId || user?.role === 'ADMIN' || boxingClass.remainingSpots <= 0 || boxingClass.isBookedByMe) return;
    setLoading(true);
    try {
      const subscription = await requestBookingSubscriptions(reminder);
      const remindBeforeMinutes = subscription.classReminderAccepted ? 120 : undefined;
      await createBooking(token, boxingClass.id, selectedBranchId, {
        remindBeforeMinutes,
        bookingConfirmationSubscribed: subscription.bookingConfirmationAccepted
      });
      await load(token, selectedBranchId);
      await showBookingSuccessModal(reminder, remindBeforeMinutes);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '预约失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
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
    void load(stored);
  });

  usePullDownRefresh(() => {
    void refreshPage();
  });

  return (
    <View className="page classes-page">
      <View className="hero">
        <BrandLogo />
        <Text className="title">训练场开放中</Text>
        <Text className="subtitle">
          {user
            ? `${user.displayName} · ${selectedBranch?.name ?? '当前门店'} · 剩余 ${selectedBalance} 节课`
            : '选择会员后开始预约'}
        </Text>
        <View className="hero__brand-line">
          <Text className="mat-lane" />
          <Text>拳击 · 体能 · 实战节奏</Text>
        </View>
      </View>

      <View className="venue-strip">
        <View className="venue-strip__mat-zone">
          <View className="venue-strip__mat-lane" />
          <View className="venue-strip__mat-dot venue-strip__mat-dot-a" />
          <View className="venue-strip__mat-dot venue-strip__mat-dot-b" />
          <View className="venue-strip__mat-dot venue-strip__mat-dot-c" />
        </View>
        <View className="venue-strip__content">
          <Text className="venue-strip__eyebrow">训练馆信息</Text>
          <Text className="venue-strip__name">{selectedBranch?.name ?? '真知格斗训练馆'}</Text>
          <Text className="venue-strip__meta">{venueAddress}</Text>
          <Text className="venue-strip__contact">{venueContact}</Text>
        </View>
      </View>

      {devAuthMode && (
        <View className="member-switch">
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

      {user?.role !== 'ADMIN' && (
        <View className="reminder-row">
          <View className="reminder-copy-wrap">
            <AppIcon name="bell" />
            <View>
              <Text className="reminder-title">开课前 2 小时提醒</Text>
              <Text className="reminder-copy">需要微信订阅消息授权后发送</Text>
            </View>
          </View>
          <Switch checked={reminder} color="#e31b23" onChange={(event) => setReminder(event.detail.value)} />
        </View>
      )}

      <Text className="section-title">可预约课程</Text>
      {classes.length > 0 && (
        <View className="date-filter-bar">
          <ScrollView className="date-filter-scroll" scrollX showScrollbar={false}>
            <View className="date-filter-track">
              {dateFilters.map((filter) => (
                <Button
                  key={filter.key}
                  className={`date-filter-button ${selectedDateKey === filter.key ? 'active' : ''}`}
                  onClick={() => setSelectedDateKey(filter.key)}
                >
                  <Text className="date-filter-label">{filter.label}</Text>
                  <Text className="date-filter-count">{filter.count} 节</Text>
                </Button>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {loading && classes.length === 0 ? (
        <LoadingCards />
      ) : loadError ? (
        <PageState
          variant="error"
          title="课程加载失败"
          description={loadError}
          actionText="重新加载"
          onAction={() => load(token, selectedBranchId)}
        />
      ) : classes.length === 0 ? (
        <PageState
          variant="empty"
          title="暂无可预约课程"
          description="当前门店还没有开放中的课程，稍后再来看看。"
          actionText="刷新课程"
          onAction={() => load(token, selectedBranchId)}
        />
      ) : (
        groupedClasses.map((group) => (
          <View className="class-date-group" key={group.label}>
            <View className="class-date-heading">
              <Text className="class-date-title">{group.label}</Text>
              <Text className="class-date-count">{group.classes.length} 节课</Text>
            </View>
            {group.classes.map((item) => {
              const action = getClassAction(item, user?.role);

              return (
                <View className="card class-card" key={item.id}>
                  <View className="row">
                    <View className="card-main">
                      <Text className="card-title">{item.title}</Text>
                      <Text className="meta">
                        {formatTime(item.startsAt)} · {item.coach}
                      </Text>
                    </View>
                    <Text className={`pill ${item.isBookedByMe ? 'booked' : item.remainingSpots > 0 ? 'red' : ''}`}>
                      {item.isBookedByMe ? '已预约' : `剩 ${item.remainingSpots} 位 / 共 ${item.capacity} 位`}
                    </Text>
                  </View>
                  <View className="class-meta-grid">
                    <Text className="class-meta-chip">时长 {item.durationMin} 分钟</Text>
                    <Text className="class-meta-chip">门店 {item.branchName ?? selectedBranch?.name ?? '当前门店'}</Text>
                    <Text className="class-meta-chip">适合 {getClassTrainingTag(item)}</Text>
                  </View>
                  <Text className="class-description">{item.description}</Text>
                  <View className="class-action-row">
                    <Button
                      className="detail-action"
                      disabled={isActionLocked('detail:' + item.id)}
                      onClick={() => void runLocked('detail:' + item.id, () => showClassDetail(item))}
                    >
                      <AppIcon name="calendar" />
                      查看详情
                    </Button>
                    <Button
                      className={`primary-action ${action.variant}`}
                      disabled={loading || action.disabled || isActionLocked('book:' + item.id)}
                      onClick={() => void runLocked('book:' + item.id, () => bookClass(item))}
                    >
                      <AppIcon name={action.icon} />
                      {action.label}
                    </Button>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}
