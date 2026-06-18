import { Button, Input, Picker, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import {
  bindAdminMemberWechat,
  cancelAdminBooking,
  cancelAdminClass,
  createAdminClass,
  deductAdminBooking,
  formatApiError,
  getAdminBookings,
  getAdminClasses,
  getAdminDailyMetrics,
  getAdminMembers,
  getStoredToken,
  setStoredBranchId,
  updateAdminClass
} from '../../api';
import { loadMemberSession } from '../../member-session';
import { attendanceStatusLabel, bookingStatusLabel, classStatusLabel } from '../../status-labels';
import { AdminBooking, AdminClass, AdminClassInput, AdminDailyMetrics, AdminMember, AuthUser, MemberBranch } from '../../types';
import { formatTime } from '../../utils';
import {
  businessDateKeyForIso,
  formatBusinessDate,
  parseBusinessDateTime,
  resolveBusinessTimezoneOffsetMinutes,
  toBusinessDateTimeParts
} from '../../ops-date';
import { AppIcon } from '../../components/AppIcon';
import { BrandLogo } from '../../components/BrandLogo';
import { LoadingCards, PageState } from '../../components/PageState';
import { useActionLock } from '../../use-action-lock';
import './index.scss';

type OpsSection = 'today' | 'classes' | 'bookings' | 'members';
type ClassFormState = {
  title: string;
  coach: string;
  startsAtDate: string;
  startsAtTime: string;
  durationMin: string;
  capacity: string;
  description: string;
};

const defaultClassForm: ClassFormState = {
  title: '',
  coach: '',
  startsAtDate: '',
  startsAtTime: '',
  durationMin: '60',
  capacity: '8',
  description: ''
};

const BUSINESS_TIMEZONE_OFFSET_MINUTES = resolveBusinessTimezoneOffsetMinutes(__BUSINESS_TIMEZONE_OFFSET_MINUTES__);

function getInputValue(event: { detail: { value: string } }) {
  return event.detail.value;
}

function getPickerValue(event: { detail: { value: string | number | string[] } }) {
  return String(event.detail.value);
}

function isActiveBooking(booking: AdminBooking) {
  return booking.status === 'BOOKED';
}

export default function OpsPage() {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [branches, setBranches] = useState<MemberBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [section, setSection] = useState<OpsSection>('today');
  const [metrics, setMetrics] = useState<AdminDailyMetrics | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [bindingCodeByMemberId, setBindingCodeByMemberId] = useState<Record<string, string>>({});
  const [classForm, setClassForm] = useState<ClassFormState>(defaultClassForm);
  const [editingClass, setEditingClass] = useState<AdminClass | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { runLocked, isActionLocked } = useActionLock();
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const todayBookings = useMemo(() => bookings.filter((item) => isActiveBooking(item)), [bookings]);
  const pendingDeductions = useMemo(
    () => todayBookings.filter((item) => item.attendanceStatus === 'PENDING' && !item.deductionId),
    [todayBookings]
  );
  const businessToday = formatBusinessDate(new Date(), BUSINESS_TIMEZONE_OFFSET_MINUTES);
  const loadedBusinessDate = metrics?.date ?? businessToday;

  function updateClassForm(key: keyof ClassFormState, value: string) {
    setClassForm((current) => ({ ...current, [key]: value }));
  }

  async function load(preferredBranchId = selectedBranchId, q = memberQuery) {
    setLoading(true);
    setLoadError('');
    try {
      const session = await loadMemberSession({ token: getStoredToken(), preferredBranchId });
      if (session.user.role !== 'ADMIN') {
        throw new Error('当前微信账号没有运营权限');
      }

      const branchId = session.selectedBranchId;
      if (!branchId) {
        throw new Error('当前员工账号没有可运营门店');
      }
      const today = formatBusinessDate(new Date(), BUSINESS_TIMEZONE_OFFSET_MINUTES);
      const [nextMetrics, nextClasses, nextBookings, nextMembers] = await Promise.all([
        getAdminDailyMetrics(session.token, { branchId, date: today }),
        getAdminClasses(session.token, branchId),
        getAdminBookings(session.token, { branchId, date: today, status: 'BOOKED' }),
        getAdminMembers(session.token, { branchId, q })
      ]);

      setToken(session.token);
      setUser(session.user);
      setBranches(session.branches);
      setSelectedBranchId(branchId);
      setMetrics(nextMetrics);
      setClasses(nextClasses);
      setBookings(nextBookings);
      setMembers(nextMembers);
    } catch (error) {
      setLoadError(formatApiError(error, '运营数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  async function switchBranch(branchId: string) {
    if (branchId === selectedBranchId) return;
    setStoredBranchId(branchId);
    await load(branchId);
  }

  function resetClassForm() {
    setEditingClass(null);
    setClassForm(defaultClassForm);
  }

  function startEditClass(item: AdminClass) {
    const startsAt = toBusinessDateTimeParts(item.startsAt, BUSINESS_TIMEZONE_OFFSET_MINUTES);
    setEditingClass(item);
    setClassForm({
      title: item.title,
      coach: item.coach,
      startsAtDate: startsAt.date,
      startsAtTime: startsAt.time,
      durationMin: String(item.durationMin),
      capacity: String(item.capacity),
      description: item.description
    });
    setSection('classes');
  }

  function buildClassPayload(): AdminClassInput | null {
    const startsAt = parseBusinessDateTime(
      classForm.startsAtDate,
      classForm.startsAtTime,
      BUSINESS_TIMEZONE_OFFSET_MINUTES
    );
    const durationMin = Number(classForm.durationMin);
    const capacity = Number(classForm.capacity);

    if (!selectedBranchId || !classForm.title.trim() || !classForm.coach.trim() || !classForm.description.trim()) {
      Taro.showToast({ title: '请补全课程信息', icon: 'none' });
      return null;
    }

    if (!startsAt || startsAt <= new Date()) {
      Taro.showToast({ title: '上课时间需晚于当前时间', icon: 'none' });
      return null;
    }

    if (!Number.isInteger(durationMin) || durationMin < 30 || durationMin > 240) {
      Taro.showToast({ title: '时长需在 30-240 分钟', icon: 'none' });
      return null;
    }

    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      Taro.showToast({ title: '容量需在 1-100 人', icon: 'none' });
      return null;
    }

    return {
      branchId: selectedBranchId,
      title: classForm.title.trim(),
      coach: classForm.coach.trim(),
      startsAt: startsAt.toISOString(),
      durationMin,
      capacity,
      description: classForm.description.trim()
    };
  }

  async function submitClass() {
    if (!token) return;
    const payload = buildClassPayload();
    if (!payload) return;

    setLoading(true);
    try {
      if (editingClass) {
        await updateAdminClass(token, editingClass.id, payload);
        Taro.showToast({ title: '课程已更新', icon: 'success' });
      } else {
        await createAdminClass(token, payload);
        Taro.showToast({ title: '课程已创建', icon: 'success' });
      }
      resetClassForm();
      await load(selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '课程保存失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function cancelClass(item: AdminClass) {
    const result = await Taro.showModal({
      title: '取消课程？',
      content: `${item.title}\n${formatTime(item.startsAt)}\n\n会同步取消有效预约并释放名额。`,
      cancelText: '再想想',
      confirmText: '取消课程',
      confirmColor: '#e31b23'
    });
    if (!result.confirm || !token) return;

    setLoading(true);
    try {
      await cancelAdminClass(token, item.id);
      Taro.showToast({ title: '课程已取消', icon: 'success' });
      await load(selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '取消课程失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function deductBooking(item: AdminBooking) {
    const result = await Taro.showModal({
      title: '确认消课？',
      content: `${item.member.displayName}\n${item.boxingClass.title}\n${formatTime(item.boxingClass.startsAt)}\n\n确认后会扣减会员 1 节课时。`,
      cancelText: '再核对',
      confirmText: '确认消课',
      confirmColor: '#e31b23'
    });
    if (!result.confirm || !token) return;

    setLoading(true);
    try {
      await deductAdminBooking(token, item.id, '小程序运营端消课');
      Taro.showToast({ title: '已消课', icon: 'success' });
      await load(selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '消课失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function cancelBooking(item: AdminBooking) {
    const result = await Taro.showModal({
      title: '取消会员预约？',
      content: `${item.member.displayName}\n${item.boxingClass.title}\n\n取消后会释放课程名额，不扣课时。`,
      cancelText: '再想想',
      confirmText: '取消预约',
      confirmColor: '#e31b23'
    });
    if (!result.confirm || !token) return;

    setLoading(true);
    try {
      await cancelAdminBooking(token, item.id, '小程序运营端手动取消');
      Taro.showToast({ title: '预约已取消', icon: 'success' });
      await load(selectedBranchId);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '取消预约失败'), icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function searchMembers() {
    await load(selectedBranchId, memberQuery);
  }

  async function bindMemberWechat(member: AdminMember) {
    const bindingCode = (bindingCodeByMemberId[member.id] || '').trim();
    if (!/^\d{6}$/.test(bindingCode)) {
      Taro.showToast({ title: '请输入 6 位绑定码', icon: 'none' });
      return;
    }

    const result = await Taro.showModal({
      title: '绑定微信？',
      content: `${member.displayName}\n绑定码：${bindingCode}\n\n确认后该微信号会绑定到此会员。`,
      cancelText: '再核对',
      confirmText: '确认绑定',
      confirmColor: '#e31b23'
    });
    if (!result.confirm || !token) return;

    setLoading(true);
    try {
      await bindAdminMemberWechat(token, member.id, { branchId: member.branchId, bindingCode });
      setBindingCodeByMemberId((current) => ({ ...current, [member.id]: '' }));
      Taro.showToast({ title: '已绑定', icon: 'success' });
      await load(selectedBranchId, memberQuery);
    } catch (error) {
      Taro.showToast({ title: formatApiError(error, '绑定失败'), icon: 'none' });
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

  useDidShow(() => {
    void load();
  });

  usePullDownRefresh(() => {
    void refreshPage();
  });

  return (
    <View className="page ops-page">
      <View className="hero ops-hero">
        <BrandLogo subLabel="OPS CONSOLE" />
        <Text className="title">运营管理</Text>
        <Text className="subtitle">
          {user ? `${user.displayName} · ${selectedBranch?.name ?? '当前门店'}` : '手机端排课、名单、消课和会员绑定'}
        </Text>
      </View>

      {branches.length > 0 && (
        <View className="branch-selector ops-branch-selector">
          {branches.map((branch) => (
            <Button
              key={branch.id}
              className={`branch-button ${selectedBranchId === branch.id ? 'active' : ''}`}
              disabled={loading || isActionLocked('switch-branch:' + branch.id)}
              onClick={() => void runLocked('switch-branch:' + branch.id, () => switchBranch(branch.id))}
            >
              <AppIcon name="branch" />
              {branch.name}
            </Button>
          ))}
        </View>
      )}

      <View className="ops-nav">
        {[
          { key: 'today', label: '今日运营' },
          { key: 'classes', label: '课程管理' },
          { key: 'bookings', label: '预约名单' },
          { key: 'members', label: '会员绑定' }
        ].map((item) => (
          <Button
            key={item.key}
            className={`ops-nav__button ${section === item.key ? 'active' : ''}`}
            onClick={() => setSection(item.key as OpsSection)}
          >
            {item.label}
          </Button>
        ))}
      </View>

      {loading && !metrics ? (
        <LoadingCards count={3} />
      ) : loadError ? (
        <PageState
          variant="error"
          title="运营数据加载失败"
          description={loadError}
          actionText="重新加载"
          onAction={() => load(selectedBranchId)}
        />
      ) : (
        <>
          {section === 'today' && (
            <View className="ops-section">
              <Text className="section-title">今日运营</Text>
              <View className="ops-metrics">
                <View className="ops-metric">
                  <Text className="ops-metric__value">
                    {
                      classes.filter(
                        (item) =>
                          businessDateKeyForIso(item.startsAt, BUSINESS_TIMEZONE_OFFSET_MINUTES) === loadedBusinessDate
                      ).length
                    }
                  </Text>
                  <Text className="ops-metric__label">今日课程</Text>
                </View>
                <View className="ops-metric">
                  <Text className="ops-metric__value">{metrics?.bookingCreatedCount ?? todayBookings.length}</Text>
                  <Text className="ops-metric__label">今日预约</Text>
                </View>
                <View className="ops-metric">
                  <Text className="ops-metric__value">{pendingDeductions.length}</Text>
                  <Text className="ops-metric__label">待消课</Text>
                </View>
                <View className="ops-metric">
                  <Text className="ops-metric__value">{metrics?.fullClassCount ?? 0}</Text>
                  <Text className="ops-metric__label">满员课程</Text>
                </View>
              </View>
              <Text className="section-title">待处理名单</Text>
              {pendingDeductions.length === 0 ? (
                <PageState variant="empty" title="暂无待消课" description="今日有效预约完成到店后，会出现在这里等待确认消课。" />
              ) : (
                pendingDeductions.map((item) => (
                  <BookingCard
                    key={item.id}
                    item={item}
                    loading={loading}
                    locked={isActionLocked('deduct:' + item.id)}
                    onDeduct={() => runLocked('deduct:' + item.id, () => deductBooking(item))}
                    onCancel={() => runLocked('cancel-booking:' + item.id, () => cancelBooking(item))}
                  />
                ))
              )}
            </View>
          )}

          {section === 'classes' && (
            <View className="ops-section">
              <Text className="section-title">课程管理</Text>
              <View className="ops-form-card">
                <Text className="ops-form-title">{editingClass ? '编辑课程' : '创建课程'}</Text>
                <Input className="ops-input" value={classForm.title} placeholder="课程名，如 基础拳击燃脂" maxlength={60} onInput={(event) => updateClassForm('title', getInputValue(event))} />
                <Input className="ops-input" value={classForm.coach} placeholder="展示教练名，如 Coach Leo" maxlength={40} onInput={(event) => updateClassForm('coach', getInputValue(event))} />
                <View className="ops-two-inputs">
                  <Picker
                    className="ops-picker-wrap"
                    mode="date"
                    value={classForm.startsAtDate}
                    start={businessToday}
                    end="2099-12-31"
                    onChange={(event) => updateClassForm('startsAtDate', getPickerValue(event))}
                  >
                    <View className={`ops-picker ${classForm.startsAtDate ? '' : 'placeholder'}`}>
                      {classForm.startsAtDate || '选择日期'}
                    </View>
                  </Picker>
                  <Picker
                    className="ops-picker-wrap"
                    mode="time"
                    value={classForm.startsAtTime}
                    onChange={(event) => updateClassForm('startsAtTime', getPickerValue(event))}
                  >
                    <View className={`ops-picker ${classForm.startsAtTime ? '' : 'placeholder'}`}>
                      {classForm.startsAtTime || '选择时间'}
                    </View>
                  </Picker>
                </View>
                <View className="ops-two-inputs">
                  <Input className="ops-input" value={classForm.durationMin} type="number" placeholder="时长分钟" onInput={(event) => updateClassForm('durationMin', getInputValue(event))} />
                  <Input className="ops-input" value={classForm.capacity} type="number" placeholder="容量人数" onInput={(event) => updateClassForm('capacity', getInputValue(event))} />
                </View>
                <Textarea className="ops-textarea" value={classForm.description} placeholder="训练重点、适合人群、强度说明" maxlength={500} onInput={(event) => updateClassForm('description', getInputValue(event))} />
                <View className="ops-action-row">
                  <Button className="ops-action ops-action--primary" disabled={loading || isActionLocked('submit-class')} onClick={() => void runLocked('submit-class', submitClass)}>
                    {editingClass ? '保存课程' : '创建课程'}
                  </Button>
                  <Button className="ops-action" onClick={resetClassForm}>清空</Button>
                </View>
              </View>

              {classes.map((item) => (
                <View className="ops-card" key={item.id}>
                  <View className="row">
                    <View className="card-main">
                      <Text className="card-title">{item.title}</Text>
                      <Text className="meta">{formatTime(item.startsAt)} · {item.coach}</Text>
                      <Text className="meta">{item.bookedCount}/{item.capacity} 人 · {classStatusLabel(item.status)}</Text>
                    </View>
                    <Text className={`pill ${item.status === 'SCHEDULED' ? 'red' : ''}`}>{item.remainingSpots} 位</Text>
                  </View>
                  <View className="ops-action-row">
                    <Button className="ops-action" onClick={() => startEditClass(item)}>编辑</Button>
                    {item.status === 'SCHEDULED' && (
                      <Button className="ops-action ops-action--danger" disabled={loading || isActionLocked('cancel-class:' + item.id)} onClick={() => void runLocked('cancel-class:' + item.id, () => cancelClass(item))}>
                        取消课程
                      </Button>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {section === 'bookings' && (
            <View className="ops-section">
              <Text className="section-title">预约名单</Text>
              {bookings.length === 0 ? (
                <PageState variant="empty" title="暂无今日预约" description="当前门店今天还没有有效预约。" />
              ) : (
                bookings.map((item) => (
                  <BookingCard
                    key={item.id}
                    item={item}
                    loading={loading}
                    locked={isActionLocked('deduct:' + item.id)}
                    onDeduct={() => runLocked('deduct:' + item.id, () => deductBooking(item))}
                    onCancel={() => runLocked('cancel-booking:' + item.id, () => cancelBooking(item))}
                  />
                ))
              )}
            </View>
          )}

          {section === 'members' && (
            <View className="ops-section">
              <Text className="section-title">会员绑定</Text>
              <View className="ops-search-row">
                <Input className="ops-input ops-search-input" value={memberQuery} placeholder="搜索会员、手机号或会员号" onInput={(event) => setMemberQuery(getInputValue(event))} />
                <Button className="ops-action ops-action--primary" disabled={loading || isActionLocked('member-search')} onClick={() => void runLocked('member-search', searchMembers)}>
                  搜索
                </Button>
              </View>
              {members.length === 0 ? (
                <PageState variant="empty" title="暂无会员" description="输入会员姓名、手机号或会员号后搜索，再用绑定码完成微信绑定。" />
              ) : (
                members.map((member) => (
                  <View className="ops-card" key={member.id}>
                    <View className="row">
                      <View className="card-main">
                        <Text className="card-title">{member.displayName}</Text>
                        <Text className="meta">{member.phone || '未登记手机号'} · 剩余 {member.lessonBalance.remaining} 节</Text>
                      </View>
                      <Text className={`pill ${member.wechatBound ? 'booked' : 'red'}`}>{member.wechatBound ? '已绑定' : '待绑定'}</Text>
                    </View>
                    <View className="ops-search-row">
                      <Input
                        className="ops-input ops-search-input"
                        value={bindingCodeByMemberId[member.id] || ''}
                        type="number"
                        maxlength={6}
                        placeholder="6 位绑定码"
                        onInput={(event) =>
                          setBindingCodeByMemberId((current) => ({
                            ...current,
                            [member.id]: getInputValue(event).slice(0, 6)
                          }))
                        }
                      />
                      <Button className="ops-action ops-action--primary" disabled={loading || isActionLocked('bind-member:' + member.id)} onClick={() => void runLocked('bind-member:' + member.id, () => bindMemberWechat(member))}>
                        绑定微信
                      </Button>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function BookingCard({
  item,
  loading,
  locked,
  onDeduct,
  onCancel
}: {
  item: AdminBooking;
  loading: boolean;
  locked: boolean;
  onDeduct: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}) {
  return (
    <View className="ops-card booking-card">
      <View className="row">
        <View className="card-main">
          <Text className="card-title">{item.member.displayName}</Text>
          <Text className="meta">{item.boxingClass.title} · {formatTime(item.boxingClass.startsAt)}</Text>
          <Text className="meta">{item.member.phone || '未登记手机号'} · {bookingStatusLabel(item.status)} · {attendanceStatusLabel(item.attendanceStatus)}</Text>
        </View>
        <Text className={`pill ${item.deductionId ? 'booked' : 'red'}`}>{item.deductionId ? '已消课' : '待确认'}</Text>
      </View>
      {isActiveBooking(item) && (
        <View className="ops-action-row">
          {!item.deductionId && (
            <Button className="ops-action ops-action--primary" disabled={loading || locked} onClick={onDeduct}>
              消课
            </Button>
          )}
          <Button className="ops-action ops-action--danger" disabled={loading} onClick={onCancel}>
            取消预约
          </Button>
        </View>
      )}
    </View>
  );
}
