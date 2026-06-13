import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  CalendarPlus,
  Dumbbell,
  Link2,
  LogOut,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlink,
  UserPlus,
  XCircle
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  adjustMemberLessons,
  bindMemberWechat,
  cancelAdminBooking,
  cancelClass,
  createClass,
  createCoach,
  createMember,
  deductBooking,
  getAdminAuditLogs,
  getAdminBranches,
  getAdminBookings,
  getAdminClasses,
  getAdminCoaches,
  getAdminDailyMetrics,
  getAdminDeductions,
  getAdminMemberLessonLedger,
  getAdminMembers,
  getAdminNotifications,
  loginAdmin,
  retryNotification,
  unbindMemberWechat,
  updateCoach,
  updateMember,
  updateClass
} from './api';
import {
  AdminAuditLog,
  AdminBooking,
  AdminBranch,
  AdminClass,
  AdminCoach,
  AdminDailyMetrics,
  AdminMember,
  AdminNotificationJob,
  AuditAction,
  AuthUser,
  CreateClassInput,
  CreateCoachInput,
  CreateMemberInput,
  Deduction,
  LessonLedgerEntry,
  NotificationJobType,
  NotificationStatus,
  UpdateCoachInput,
  UpdateMemberInput
} from './types';

type ClassFormValues = Omit<CreateClassInput, 'startsAt'> & {
  startsAtLocal: string;
};

type MemberFormValues = CreateMemberInput;

type CoachFormValues = CreateCoachInput;

type UpdateCoachFormValues = Omit<UpdateCoachInput, 'branchId'>;

type UpdateMemberFormValues = Omit<UpdateMemberInput, 'branchId'>;

type LessonAdjustmentFormValues = {
  delta: number;
  reason: string;
};

type ClassRosterGroup = {
  classId: string;
  branchId: string;
  title: string;
  coach: string;
  startsAt: string;
  bookings: AdminBooking[];
};

type MemberFilters = {
  q: string;
};

const emptyMemberFilters: MemberFilters = { q: '' };

type BookingFilters = {
  date: string;
  q: string;
  status: string;
};

const emptyBookingFilters: BookingFilters = { date: '', q: '', status: '' };

type NotificationFilters = {
  q: string;
  status: NotificationStatus | '';
};

const emptyNotificationFilters: NotificationFilters = { q: '', status: '' };

type AuditLogFilters = {
  q: string;
  action: AuditAction | '';
};

const emptyAuditLogFilters: AuditLogFilters = { q: '', action: '' };
const MEMBER_NAME_MAX_LENGTH = 40;
const MEMBER_NO_MAX_LENGTH = 40;
const COACH_NAME_MAX_LENGTH = 40;
const COACH_NICKNAME_MAX_LENGTH = 40;
const COACH_USERNAME_MAX_LENGTH = 60;
const CLASS_TITLE_MAX_LENGTH = 60;
const CLASS_COACH_MAX_LENGTH = 40;
const CLASS_DESCRIPTION_MAX_LENGTH = 500;

const storedToken = localStorage.getItem('admin_token');
const storedUser = localStorage.getItem('admin_user');
const storedBranchId = localStorage.getItem('admin_branch_id') ?? '';

const statusLabels: Record<string, string> = {
  BOOKED: '已预约',
  SCHEDULED: '已排课',
  ATTENDED: '已消课',
  CANCELED: '已取消',
  PENDING: '待上课'
};

function statusText(status: string) {
  return statusLabels[status] ?? status;
}

function statusTag(status: string) {
  if (status === 'BOOKED' || status === 'SCHEDULED') return <Tag color="green">{statusText(status)}</Tag>;
  if (status === 'ATTENDED') return <Tag color="red">{statusText(status)}</Tag>;
  if (status === 'CANCELED') return <Tag color="default">{statusText(status)}</Tag>;
  return <Tag color="gold">{statusText(status)}</Tag>;
}

function notificationStatusTag(status: NotificationStatus) {
  const labels: Record<NotificationStatus, string> = {
    PENDING: '待发送',
    SENT: '已发送',
    FAILED: '发送失败',
    SKIPPED: '已跳过'
  };
  const colors: Record<NotificationStatus, string> = {
    PENDING: 'gold',
    SENT: 'green',
    FAILED: 'red',
    SKIPPED: 'default'
  };

  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

function notificationTypeLabel(type: NotificationJobType) {
  const labels: Record<NotificationJobType, string> = {
    BOOKING_CREATED: '预约确认',
    CLASS_REMINDER: '开课提醒',
    CLASS_CANCELED: '课程取消通知',
    CLASS_RESCHEDULED: '课程改期通知'
  };

  return labels[type] ?? type;
}

function ledgerEntryTypeTag(entry: LessonLedgerEntry) {
  return entry.type === 'ADJUSTMENT' ? <Tag color="blue">课时调整</Tag> : <Tag color="red">消课</Tag>;
}

function auditActionTag(action: AuditAction) {
  const labels: Record<AuditAction, string> = {
    CLASS_CREATE: '创建课程',
    CLASS_UPDATE: '编辑课程',
    CLASS_CANCEL: '取消课程',
    BOOKING_CANCEL: '取消预约',
    LESSON_DEDUCT: '消课',
    LESSON_ADJUST: '课时调整',
    NOTIFICATION_RETRY: '重试通知',
    MEMBER_CREATE: '创建会员',
    WECHAT_BIND: '绑定微信',
    WECHAT_UNBIND: '解绑微信',
    MEMBER_UPDATE: '更新会员资料',
    COACH_CREATE: '创建教练',
    COACH_UPDATE: '更新教练'
  };
  const colors: Record<AuditAction, string> = {
    CLASS_CREATE: 'green',
    CLASS_UPDATE: 'cyan',
    CLASS_CANCEL: 'volcano',
    BOOKING_CANCEL: 'orange',
    LESSON_DEDUCT: 'red',
    LESSON_ADJUST: 'purple',
    NOTIFICATION_RETRY: 'blue',
    MEMBER_CREATE: 'green',
    WECHAT_BIND: 'geekblue',
    WECHAT_UNBIND: 'default',
    MEMBER_UPDATE: 'cyan',
    COACH_CREATE: 'green',
    COACH_UPDATE: 'cyan'
  };

  return <Tag color={colors[action]}>{labels[action] ?? action}</Tag>;
}

function toIsoFromLocal(value: string) {
  return new Date(value).toISOString();
}

function toLocalInputValue(value: string) {
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
}

function escapeCsvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function canSelectAllBranches(branches: AdminBranch[]) {
  return branches.some((branch) => branch.staffRole === 'OWNER');
}

function resolveAdminBranchId(branches: AdminBranch[], preferredBranchId: string) {
  const canSelectAll = canSelectAllBranches(branches);
  if (canSelectAll && preferredBranchId === '') return '';
  if (preferredBranchId && branches.some((branch) => branch.id === preferredBranchId)) return preferredBranchId;
  return canSelectAll ? '' : branches[0]?.id ?? '';
}

function groupBookingsByClass(bookings: AdminBooking[]): ClassRosterGroup[] {
  const groups = new Map<string, ClassRosterGroup>();

  bookings
    .filter((booking) => booking.status === 'BOOKED')
    .forEach((booking) => {
      const classId = booking.boxingClass.id;
      const current = groups.get(classId);
      if (current) {
        current.bookings.push(booking);
        return;
      }

      groups.set(classId, {
        classId,
        branchId: booking.branchId,
        title: booking.boxingClass.title,
        coach: booking.boxingClass.coach,
        startsAt: booking.boxingClass.startsAt,
        bookings: [booking]
      });
    });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      bookings: [...group.bookings].sort((left, right) =>
        left.member.displayName.localeCompare(right.member.displayName, 'zh-Hans-CN')
      )
    }))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

function createBookingRosterCsv(bookings: AdminBooking[], branchNameById: ReadonlyMap<string, string>) {
  const rows = [
    ['课程', '上课时间', '门店', '教练', '会员', '手机号', '预约状态', '到课状态'],
    ...bookings.map((booking) => [
      booking.boxingClass.title,
      dayjs(booking.boxingClass.startsAt).format('YYYY-MM-DD HH:mm'),
      branchNameById.get(booking.branchId) ?? '',
      booking.boxingClass.coach,
      booking.member.displayName,
      booking.member.phone ?? '',
      statusText(booking.status),
      statusText(booking.attendanceStatus)
    ])
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

function downloadBookingRosterCsv(bookings: AdminBooking[], branchNameById: ReadonlyMap<string, string>) {
  const csv = createBookingRosterCsv(bookings, branchNameById);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `booking-roster-${dayjs().format('YYYY-MM-DD-HHmm')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [token, setToken] = useState<string | null>(storedToken);
  const [user, setUser] = useState<AuthUser | null>(storedUser ? (JSON.parse(storedUser) as AuthUser) : null);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(storedBranchId);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [coaches, setCoaches] = useState<AdminCoach[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<AdminDailyMetrics | null>(null);
  const [notificationJobs, setNotificationJobs] = useState<AdminNotificationJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberFilters, setMemberFilters] = useState<MemberFilters>(emptyMemberFilters);
  const [memberFilterDraft, setMemberFilterDraft] = useState<MemberFilters>(emptyMemberFilters);
  const [bookingFilters, setBookingFilters] = useState<BookingFilters>(emptyBookingFilters);
  const [bookingFilterDraft, setBookingFilterDraft] = useState<BookingFilters>(emptyBookingFilters);
  const [notificationFilters, setNotificationFilters] = useState<NotificationFilters>(emptyNotificationFilters);
  const [notificationFilterDraft, setNotificationFilterDraft] =
    useState<NotificationFilters>(emptyNotificationFilters);
  const [auditLogFilters, setAuditLogFilters] = useState<AuditLogFilters>(emptyAuditLogFilters);
  const [auditLogFilterDraft, setAuditLogFilterDraft] = useState<AuditLogFilters>(emptyAuditLogFilters);
  const [editingClass, setEditingClass] = useState<AdminClass | null>(null);
  const [editingCoach, setEditingCoach] = useState<AdminCoach | null>(null);
  const [editingMember, setEditingMember] = useState<AdminMember | null>(null);
  const [bindingMember, setBindingMember] = useState<AdminMember | null>(null);
  const [lessonAdjustingMember, setLessonAdjustingMember] = useState<AdminMember | null>(null);
  const [viewingLedgerMember, setViewingLedgerMember] = useState<AdminMember | null>(null);
  const [lessonLedgerEntries, setLessonLedgerEntries] = useState<LessonLedgerEntry[]>([]);
  const [bindOpenid, setBindOpenid] = useState('');
  const [deductingBooking, setDeductingBooking] = useState<AdminBooking | null>(null);
  const [deductNote, setDeductNote] = useState('');
  const [cancelingBooking, setCancelingBooking] = useState<AdminBooking | null>(null);
  const [cancelBookingReason, setCancelBookingReason] = useState('');
  const [expandedRosterClassIds, setExpandedRosterClassIds] = useState<string[]>([]);
  const [memberForm] = Form.useForm<MemberFormValues>();
  const [coachForm] = Form.useForm<CoachFormValues>();
  const [editCoachForm] = Form.useForm<UpdateCoachFormValues>();
  const [editMemberForm] = Form.useForm<UpdateMemberFormValues>();
  const [lessonAdjustmentForm] = Form.useForm<LessonAdjustmentFormValues>();
  const [classForm] = Form.useForm<ClassFormValues>();

  const isLoggedIn = Boolean(token && user);
  const selectedBranchName =
    selectedBranchId === ''
      ? '全部门店'
      : branches.find((branch) => branch.id === selectedBranchId)?.name ?? '当前门店';
  const branchOptions = useMemo(
    () => [
      ...(canSelectAllBranches(branches) ? [{ value: '', label: '全部门店' }] : []),
      ...branches.map((branch) => ({ value: branch.id, label: `${branch.name} · ${branch.staffRole}` }))
    ],
    [branches]
  );
  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );
  const coachOptionsByBranch = useMemo(() => {
    const options = new Map<string, { value: string; label: string }[]>();

    coaches
      .filter((coach) => coach.status === 'ACTIVE')
      .forEach((coach) => {
        const current = options.get(coach.branchId) ?? [];
        current.push({
          value: coach.id,
          label: `${coach.nickname || coach.displayName} · ${coach.displayName}`
        });
        options.set(coach.branchId, current);
      });

    return options;
  }, [coaches]);
  const todayRosterGroups = useMemo(() => groupBookingsByClass(bookings), [bookings]);
  const metricCards = useMemo(
    () => [
      { label: '今日预约', value: dailyMetrics?.bookingCreatedCount ?? 0 },
      { label: '今日取消', value: dailyMetrics?.bookingCanceledCount ?? 0 },
      { label: '今日消课', value: dailyMetrics?.lessonDeductedCount ?? 0 },
      { label: '满员课程', value: dailyMetrics?.fullClassCount ?? 0 }
    ],
    [dailyMetrics]
  );

  async function loadMembers(currentToken = token, branchId = selectedBranchId, filters = memberFilters) {
    if (!currentToken) return;
    const data = await getAdminMembers(currentToken, { ...filters, branchId });
    setMembers(data);
  }

  async function loadCoaches(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminCoaches(currentToken, { branchId });
    setCoaches(data);
  }

  async function loadBookings(currentToken = token, branchId = selectedBranchId, filters = bookingFilters) {
    if (!currentToken) return;
    const data = await getAdminBookings(currentToken, { ...filters, branchId });
    setBookings(data);
  }

  async function loadClasses(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminClasses(currentToken, branchId || undefined);
    setClasses(data);
  }

  async function loadDeductions(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminDeductions(currentToken, branchId || undefined);
    setDeductions(data);
  }

  async function loadDailyMetrics(currentToken = token, branchId = selectedBranchId) {
    if (!currentToken) return;
    const data = await getAdminDailyMetrics(currentToken, {
      branchId: branchId || undefined,
      date: dayjs().format('YYYY-MM-DD')
    });
    setDailyMetrics(data);
  }

  async function loadNotifications(
    currentToken = token,
    branchId = selectedBranchId,
    filters = notificationFilters
  ) {
    if (!currentToken) return;
    const data = await getAdminNotifications(currentToken, { ...filters, branchId });
    setNotificationJobs(data);
  }

  async function loadAuditLogs(currentToken = token, branchId = selectedBranchId, filters = auditLogFilters) {
    if (!currentToken) return;
    const data = await getAdminAuditLogs(currentToken, { ...filters, branchId });
    setAuditLogs(data);
  }

  async function refreshAll(currentToken = token, preferredBranchId = selectedBranchId) {
    if (!currentToken) return;
    setLoading(true);
    try {
      const nextBranches = await getAdminBranches(currentToken);
      const nextBranchId = resolveAdminBranchId(nextBranches, preferredBranchId);
      localStorage.setItem('admin_branch_id', nextBranchId);
      setBranches(nextBranches);
      setSelectedBranchId(nextBranchId);
      await Promise.all([
        loadMembers(currentToken, nextBranchId),
        loadCoaches(currentToken, nextBranchId),
        loadBookings(currentToken, nextBranchId),
        loadClasses(currentToken, nextBranchId),
        loadDeductions(currentToken, nextBranchId),
        loadDailyMetrics(currentToken, nextBranchId),
        loadNotifications(currentToken, nextBranchId),
        loadAuditLogs(currentToken, nextBranchId)
      ]);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoggedIn) {
      void refreshAll();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && branches.length > 0 && !memberForm.getFieldValue('branchId')) {
      memberForm.setFieldsValue({
        branchId: selectedBranchId || branches[0].id,
        initialLessons: memberForm.getFieldValue('initialLessons') ?? 0
      });
    }
  }, [branches, isLoggedIn, memberForm, selectedBranchId]);

  useEffect(() => {
    if (isLoggedIn && branches.length > 0 && !coachForm.getFieldValue('branchId')) {
      coachForm.setFieldsValue({
        branchId: selectedBranchId || branches[0].id
      });
    }
  }, [branches, coachForm, isLoggedIn, selectedBranchId]);

  async function handleLogin(values: { username: string; password: string }) {
    setLoading(true);
    try {
      const response = await loginAdmin(values.username, values.password);
      localStorage.setItem('admin_token', response.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(response.user));
      setToken(response.accessToken);
      setUser(response.user);
      messageApi.success('已登录后台');
      await refreshAll(response.accessToken);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('admin_branch_id');
    setToken(null);
    setUser(null);
    setBranches([]);
    setSelectedBranchId('');
    setMembers([]);
    setCoaches([]);
    setBookings([]);
    setClasses([]);
    setDeductions([]);
    setDailyMetrics(null);
    setNotificationJobs([]);
    setAuditLogs([]);
  }

  async function handleBranchChange(branchId: string) {
    localStorage.setItem('admin_branch_id', branchId);
    setSelectedBranchId(branchId);
    memberForm.setFieldsValue({ branchId: branchId || branches[0]?.id });
    coachForm.setFieldsValue({ branchId: branchId || branches[0]?.id });
    await refreshAll(token, branchId);
  }

  async function applyMemberFilters() {
    if (!token) return;
    setLoading(true);
    try {
      setMemberFilters(memberFilterDraft);
      await loadMembers(token, selectedBranchId, memberFilterDraft);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }

  async function resetMemberFilters() {
    if (!token) return;
    setMemberFilterDraft(emptyMemberFilters);
    setMemberFilters(emptyMemberFilters);
    setLoading(true);
    try {
      await loadMembers(token, selectedBranchId, emptyMemberFilters);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '重置失败');
    } finally {
      setLoading(false);
    }
  }

  async function applyBookingFilters() {
    if (!token) return;
    setLoading(true);
    try {
      setBookingFilters(bookingFilterDraft);
      await loadBookings(token, selectedBranchId, bookingFilterDraft);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }

  async function resetBookingFilters() {
    if (!token) return;
    setBookingFilterDraft(emptyBookingFilters);
    setBookingFilters(emptyBookingFilters);
    setExpandedRosterClassIds([]);
    setLoading(true);
    try {
      await loadBookings(token, selectedBranchId, emptyBookingFilters);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '重置失败');
    } finally {
      setLoading(false);
    }
  }

  async function applyTodayBookingRoster() {
    if (!token) return;
    const todayFilters: BookingFilters = {
      date: dayjs().format('YYYY-MM-DD'),
      q: '',
      status: 'BOOKED'
    };
    setBookingFilterDraft(todayFilters);
    setBookingFilters(todayFilters);
    setExpandedRosterClassIds([]);
    setLoading(true);
    try {
      await loadBookings(token, selectedBranchId, todayFilters);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '今日课程加载失败');
    } finally {
      setLoading(false);
    }
  }

  function toggleRosterClass(classId: string) {
    setExpandedRosterClassIds((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]
    );
  }

  function handleExportBookingRoster() {
    if (bookings.length === 0) {
      messageApi.warning('当前筛选没有可导出的预约记录');
      return;
    }

    downloadBookingRosterCsv(bookings, branchNameById);
    messageApi.success('预约名单已导出');
  }

  async function applyNotificationFilters() {
    if (!token) return;
    setLoading(true);
    try {
      setNotificationFilters(notificationFilterDraft);
      await loadNotifications(token, selectedBranchId, notificationFilterDraft);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }

  async function resetNotificationFilters() {
    if (!token) return;
    setNotificationFilterDraft(emptyNotificationFilters);
    setNotificationFilters(emptyNotificationFilters);
    setLoading(true);
    try {
      await loadNotifications(token, selectedBranchId, emptyNotificationFilters);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '重置失败');
    } finally {
      setLoading(false);
    }
  }

  async function applyAuditLogFilters() {
    if (!token) return;
    setLoading(true);
    try {
      setAuditLogFilters(auditLogFilterDraft);
      await loadAuditLogs(token, selectedBranchId, auditLogFilterDraft);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '查询失败');
    } finally {
      setLoading(false);
    }
  }

  async function resetAuditLogFilters() {
    if (!token) return;
    setAuditLogFilterDraft(emptyAuditLogFilters);
    setAuditLogFilters(emptyAuditLogFilters);
    setLoading(true);
    try {
      await loadAuditLogs(token, selectedBranchId, emptyAuditLogFilters);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '重置失败');
    } finally {
      setLoading(false);
    }
  }

  function resetMemberForm() {
    memberForm.resetFields();
    memberForm.setFieldsValue({
      branchId: selectedBranchId || branches[0]?.id,
      initialLessons: 0
    });
  }

  async function submitMember(values: MemberFormValues) {
    if (!token) return;
    const payload: CreateMemberInput = {
      branchId: values.branchId,
      displayName: values.displayName.trim(),
      phone: values.phone?.trim() || undefined,
      memberNo: values.memberNo?.trim() || undefined,
      initialLessons: values.initialLessons ?? 0,
      wechatOpenid: values.wechatOpenid?.trim() || undefined
    };

    setLoading(true);
    try {
      await createMember(token, payload);
      messageApi.success('会员已创建');
      resetMemberForm();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '会员保存失败');
    } finally {
      setLoading(false);
    }
  }

  function resetCoachForm() {
    coachForm.resetFields();
    coachForm.setFieldsValue({
      branchId: selectedBranchId || branches[0]?.id
    });
  }

  async function submitCoach(values: CoachFormValues) {
    if (!token) return;
    const payload: CreateCoachInput = {
      branchId: values.branchId,
      displayName: values.displayName.trim(),
      nickname: values.nickname.trim(),
      username: values.username.trim(),
      password: values.password,
      phone: values.phone?.trim() || undefined
    };

    setLoading(true);
    try {
      await createCoach(token, payload);
      messageApi.success('教练已创建');
      resetCoachForm();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '教练保存失败');
    } finally {
      setLoading(false);
    }
  }

  function startEditCoach(record: AdminCoach) {
    setEditingCoach(record);
    editCoachForm.setFieldsValue({
      displayName: record.displayName,
      nickname: record.nickname ?? undefined,
      phone: record.phone ?? undefined,
      status: record.status
    });
  }

  async function confirmUpdateCoach() {
    if (!token || !editingCoach) return;
    const values = await editCoachForm.validateFields();

    setLoading(true);
    try {
      await updateCoach(token, editingCoach.id, {
        branchId: editingCoach.branchId,
        displayName: values.displayName?.trim(),
        nickname: values.nickname?.trim(),
        phone: values.phone?.trim() || undefined,
        status: values.status
      });
      messageApi.success('教练资料已更新');
      setEditingCoach(null);
      editCoachForm.resetFields();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '教练资料更新失败');
    } finally {
      setLoading(false);
    }
  }

  async function confirmBindWechat() {
    if (!token || !bindingMember) return;
    const openid = bindOpenid.trim();
    if (!openid) {
      messageApi.error('请输入微信绑定码或 openid');
      return;
    }

    setLoading(true);
    try {
      const identity = /^\d{6}$/.test(openid) ? { bindingCode: openid } : { wechatOpenid: openid };
      await bindMemberWechat(token, bindingMember.id, { branchId: bindingMember.branchId, ...identity });
      messageApi.success('微信已绑定');
      setBindingMember(null);
      setBindOpenid('');
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '绑定失败');
    } finally {
      setLoading(false);
    }
  }

  function startEditMember(record: AdminMember) {
    setEditingMember(record);
    editMemberForm.setFieldsValue({
      displayName: record.displayName,
      phone: record.phone ?? undefined,
      memberNo: record.memberNo ?? undefined
    });
  }

  async function confirmUpdateMember() {
    if (!token || !editingMember) return;
    const values = await editMemberForm.validateFields();

    setLoading(true);
    try {
      await updateMember(token, editingMember.id, {
        branchId: editingMember.branchId,
        displayName: values.displayName?.trim(),
        phone: values.phone?.trim() || undefined,
        memberNo: values.memberNo?.trim() ?? ''
      });
      messageApi.success('会员资料已更新');
      setEditingMember(null);
      editMemberForm.resetFields();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '会员资料更新失败');
    } finally {
      setLoading(false);
    }
  }

  function handleUnbindWechat(record: AdminMember) {
    if (!token) return;
    Modal.confirm({
      title: '解绑这个会员的微信？',
      content: `${record.displayName} 解绑后，原微信需要重新获取绑定码或由后台重新绑定。`,
      okText: '确认解绑',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await unbindMemberWechat(token, record.id, { branchId: record.branchId });
        messageApi.success('微信已解绑');
        await refreshAll();
      }
    });
  }

  function startAdjustLessons(record: AdminMember) {
    setLessonAdjustingMember(record);
    lessonAdjustmentForm.setFieldsValue({
      delta: 1,
      reason: ''
    });
  }

  async function confirmLessonAdjustment() {
    if (!token || !lessonAdjustingMember) return;
    const values = await lessonAdjustmentForm.validateFields();
    const reason = values.reason.trim();

    setLoading(true);
    try {
      await adjustMemberLessons(token, lessonAdjustingMember.id, {
        branchId: lessonAdjustingMember.branchId,
        delta: values.delta,
        reason
      });
      messageApi.success('课时已调整');
      setLessonAdjustingMember(null);
      lessonAdjustmentForm.resetFields();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课时调整失败');
    } finally {
      setLoading(false);
    }
  }

  async function openMemberLessonLedger(record: AdminMember) {
    if (!token) return;
    setLoading(true);
    try {
      const ledger = await getAdminMemberLessonLedger(token, record.id, record.branchId);
      setViewingLedgerMember(ledger.member);
      setLessonLedgerEntries(ledger.entries);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课时流水加载失败');
    } finally {
      setLoading(false);
    }
  }

  function startCreateClass() {
    setEditingClass(null);
    classForm.resetFields();
    classForm.setFieldsValue({
      branchId: selectedBranchId || branches[0]?.id,
      coachId: undefined,
      coach: undefined,
      durationMin: 60,
      capacity: 8,
      startsAtLocal: dayjs().add(1, 'day').hour(19).minute(30).format('YYYY-MM-DDTHH:mm')
    });
  }

  function startEditClass(record: AdminClass) {
    setEditingClass(record);
    classForm.setFieldsValue({
      branchId: record.branchId,
      coachId: record.coachId ?? undefined,
      title: record.title,
      coach: record.coach,
      startsAtLocal: toLocalInputValue(record.startsAt),
      durationMin: record.durationMin,
      capacity: record.capacity,
      description: record.description
    });
  }

  async function submitClass(values: ClassFormValues) {
    if (!token) return;
    const classDetails = {
      title: values.title.trim(),
      coachId: values.coachId,
      coach: values.coach.trim(),
      startsAt: toIsoFromLocal(values.startsAtLocal),
      durationMin: values.durationMin,
      capacity: values.capacity,
      description: values.description.trim()
    };

    setLoading(true);
    try {
      if (editingClass) {
        await updateClass(token, editingClass.id, classDetails);
        messageApi.success('课程已更新');
      } else {
        const payload: CreateClassInput = {
          ...classDetails,
          branchId: values.branchId
        };
        await createClass(token, payload);
        messageApi.success('课程已创建');
      }
      setEditingClass(null);
      classForm.resetFields();
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课程保存失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelClass(record: AdminClass) {
    if (!token) return;
    Modal.confirm({
      title: '取消这节课？',
      content: (
        <div>
          <p>
            {record.title} / {dayjs(record.startsAt).format('MM月DD日 HH:mm')}
          </p>
          <p>
            影响 {record.bookedCount} 位已预约会员，取消后会释放名额并生成课程取消通知任务。
          </p>
        </div>
      ),
      okText: '确认取消',
      okButtonProps: { danger: true },
      cancelText: '保留',
      onOk: async () => {
        await cancelClass(token, record.id);
        messageApi.success('课程已取消');
        await refreshAll();
      }
    });
  }

  async function confirmDeduct() {
    if (!token || !deductingBooking) return;
    setLoading(true);
    try {
      await deductBooking(token, deductingBooking.id, deductNote || undefined);
      messageApi.success('消课完成');
      setDeductingBooking(null);
      setDeductNote('');
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '消课失败');
    } finally {
      setLoading(false);
    }
  }

  function startCancelBooking(record: AdminBooking) {
    setCancelingBooking(record);
    setCancelBookingReason('');
  }

  async function confirmCancelBooking() {
    if (!token || !cancelingBooking) return;
    const reason = cancelBookingReason.trim();

    setLoading(true);
    try {
      await cancelAdminBooking(token, cancelingBooking.id, reason || undefined);
      messageApi.success('预约已取消');
      setCancelingBooking(null);
      setCancelBookingReason('');
      await refreshAll();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '取消预约失败');
    } finally {
      setLoading(false);
    }
  }

  function handleRetryNotification(record: AdminNotificationJob) {
    if (!token) return;
    Modal.confirm({
      title: '重试这条提醒？',
      content: `${record.member.displayName} / ${record.boxingClass.title}`,
      okText: '立即重试',
      cancelText: '取消',
      onOk: async () => {
        await retryNotification(token, record.id);
        messageApi.success('提醒已重试');
        await refreshAll();
      }
    });
  }

  const coachColumns: ColumnsType<AdminCoach> = useMemo(
    () => [
      {
        title: '教练',
        render: (_value, record) => (
          <div>
            <strong>{record.nickname || record.displayName}</strong>
            <div className="subtle">{record.displayName}</div>
          </div>
        )
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{record.branchName || branchNameById.get(record.branchId) || '-'}</Tag>
      },
      {
        title: '账号',
        render: (_value, record) => (
          <div>
            <strong>{record.username || '-'}</strong>
            <div className="subtle">{record.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: AdminCoach['status']) =>
          value === 'ACTIVE' ? <Tag color="green">启用</Tag> : <Tag color="default">停用</Tag>
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Button icon={<Pencil size={16} />} onClick={() => startEditCoach(record)}>
            编辑资料
          </Button>
        )
      }
    ],
    [branchNameById, editCoachForm]
  );

  const memberColumns: ColumnsType<AdminMember> = useMemo(
    () => [
      {
        title: '会员',
        render: (_value, record) => (
          <div>
            <strong>{record.displayName}</strong>
            <div className="subtle">{record.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{record.branchName || branchNameById.get(record.branchId) || '-'}</Tag>
      },
      {
        title: '会员号',
        dataIndex: 'memberNo',
        render: (value: string | null) => value || '-'
      },
      {
        title: '剩余课时',
        render: (_value, record) => <strong>{record.lessonBalance.remaining}</strong>
      },
      {
        title: '微信',
        render: (_value, record) =>
          record.wechatBound ? <Tag color="green">已绑定</Tag> : <Tag color="gold">未绑定</Tag>
      },
      {
        title: '入会时间',
        dataIndex: 'joinedAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Space wrap>
            <Button icon={<Pencil size={16} />} onClick={() => startEditMember(record)}>
              编辑资料
            </Button>
            <Button icon={<PlusCircle size={16} />} onClick={() => startAdjustLessons(record)}>
              调整课时
            </Button>
            <Button onClick={() => void openMemberLessonLedger(record)}>
              课时流水
            </Button>
            <Button
              icon={<Link2 size={16} />}
              disabled={record.wechatBound}
              onClick={() => {
                setBindingMember(record);
                setBindOpenid('');
              }}
            >
              绑定微信
            </Button>
            <Button
              danger
              icon={<Unlink size={16} />}
              disabled={!record.wechatBound}
              onClick={() => handleUnbindWechat(record)}
            >
              解绑微信
            </Button>
          </Space>
        )
      }
    ],
    [branchNameById, editMemberForm, lessonAdjustmentForm]
  );

  const bookingColumns: ColumnsType<AdminBooking> = useMemo(
    () => [
      {
        title: '课程',
        dataIndex: ['boxingClass', 'title'],
        render: (_value, record) => (
          <div>
            <strong>{record.boxingClass.title}</strong>
            <div className="subtle">{record.boxingClass.coach}</div>
          </div>
        )
      },
      {
        title: '时间',
        dataIndex: ['boxingClass', 'startsAt'],
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{branchNameById.get(record.branchId) ?? '-'}</Tag>
      },
      {
        title: '会员',
        dataIndex: ['member', 'displayName'],
        render: (_value, record) => (
          <div>
            <strong>{record.member.displayName}</strong>
            <div className="subtle">{record.member.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '状态',
        render: (_value, record) => (
          <Space size={4}>
            {statusTag(record.status)}
            {statusTag(record.attendanceStatus)}
          </Space>
        )
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Space wrap>
            <Button
              danger
              disabled={record.status !== 'BOOKED' || record.attendanceStatus === 'ATTENDED' || Boolean(record.deductionId)}
              onClick={() => setDeductingBooking(record)}
            >
              消课
            </Button>
            <Button
              icon={<XCircle size={16} />}
              disabled={record.status !== 'BOOKED' || record.attendanceStatus === 'ATTENDED' || Boolean(record.deductionId)}
              onClick={() => startCancelBooking(record)}
            >
              取消预约
            </Button>
          </Space>
        )
      }
    ],
    [branchNameById]
  );

  const classColumns: ColumnsType<AdminClass> = useMemo(
    () => [
      {
        title: '课程',
        render: (_value, record) => (
          <div>
            <strong>{record.title}</strong>
            <div className="subtle">{record.description}</div>
          </div>
        )
      },
      { title: '教练', dataIndex: 'coach' },
      {
        title: '门店',
        render: (_value, record) => <Tag>{record.branchName ?? branchNameById.get(record.branchId) ?? '-'}</Tag>
      },
      {
        title: '时间',
        dataIndex: 'startsAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      {
        title: '名额',
        render: (_value, record) => `${record.remainingSpots}/${record.capacity}`
      },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: string) => statusTag(value)
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Space>
            <Button onClick={() => startEditClass(record)}>编辑</Button>
            <Button danger disabled={record.status === 'CANCELED'} onClick={() => void handleCancelClass(record)}>
              取消
            </Button>
          </Space>
        )
      }
    ],
    [branchNameById]
  );

  const deductionColumns: ColumnsType<Deduction> = useMemo(
    () => [
      {
        title: '会员',
        render: (_value, record) => (
          <div>
            <strong>{record.member.displayName}</strong>
            <div className="subtle">{record.member.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '课程',
        render: (_value, record) => (
          <div>
            <strong>{record.boxingClass.title}</strong>
            <div className="subtle">{record.boxingClass.coach}</div>
          </div>
        )
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{branchNameById.get(record.branchId) ?? '-'}</Tag>
      },
      {
        title: '消课时间',
        dataIndex: 'createdAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      { title: '数量', dataIndex: 'amount' },
      { title: '备注', dataIndex: 'note', render: (value: string | null) => value || '-' }
    ],
    [branchNameById]
  );

  const notificationColumns: ColumnsType<AdminNotificationJob> = useMemo(
    () => [
      {
        title: '课程',
        render: (_value, record) => (
          <div>
            <strong>{record.boxingClass.title}</strong>
            <div className="subtle">{dayjs(record.boxingClass.startsAt).format('MM月DD日 HH:mm')}</div>
          </div>
        )
      },
      {
        title: '计划发送',
        dataIndex: 'scheduledAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm')
      },
      {
        title: '类型',
        render: (_value, record) => (
          <Tag
            color={
              record.type === 'BOOKING_CREATED'
                ? 'green'
                : record.type === 'CLASS_CANCELED'
                  ? 'volcano'
                  : record.type === 'CLASS_RESCHEDULED'
                    ? 'gold'
                    : 'blue'
            }
          >
            {notificationTypeLabel(record.type)}
          </Tag>
        )
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{record.branchName || branchNameById.get(record.branchId) || '-'}</Tag>
      },
      {
        title: '会员',
        render: (_value, record) => (
          <div>
            <strong>{record.member.displayName}</strong>
            <div className="subtle">{record.member.phone || '未填手机号'}</div>
          </div>
        )
      },
      {
        title: '状态 / 日志',
        render: (_value, record) => (
          <div>
            {notificationStatusTag(record.status)}
            <div className="subtle log-message">
              {record.latestLog
                ? `${record.latestLog.message} · ${dayjs(record.latestLog.createdAt).format('MM月DD日 HH:mm')}`
                : '暂无发送日志'}
            </div>
          </div>
        )
      },
      {
        title: '操作',
        render: (_value, record) => (
          <Button
            icon={<RefreshCw size={16} />}
            disabled={record.status !== 'FAILED' && record.status !== 'SKIPPED'}
            onClick={() => handleRetryNotification(record)}
          >
            重试
          </Button>
        )
      }
    ],
    [branchNameById, token]
  );

  const auditLogColumns: ColumnsType<AdminAuditLog> = useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'createdAt',
        render: (value: string) => dayjs(value).format('MM月DD日 HH:mm:ss')
      },
      {
        title: '动作',
        dataIndex: 'action',
        render: (value: AuditAction) => auditActionTag(value)
      },
      {
        title: '门店',
        render: (_value, record) => <Tag>{record.branchName || branchNameById.get(record.branchId) || '-'}</Tag>
      },
      {
        title: '操作者',
        render: (_value, record) => <strong>{record.admin.displayName}</strong>
      },
      {
        title: '记录',
        render: (_value, record) => (
          <div>
            <strong>{record.message}</strong>
            <div className="subtle log-message">
              {record.entityType} · {record.entityId}
            </div>
          </div>
        )
      }
    ],
    [branchNameById]
  );

  const tabItems = [
    {
      key: 'members',
      label: '会员绑定',
      children: (
        <section className="class-grid">
          <div className="panel">
            <div className="panel-title">
              <UserPlus size={18} />
              新建会员
            </div>
            <Form
              form={memberForm}
              layout="vertical"
              initialValues={{ branchId: selectedBranchId || branches[0]?.id, initialLessons: 0 }}
              onFinish={(values) => void submitMember(values)}
            >
              <Form.Item
                name="displayName"
                label="姓名"
                rules={[
                  { required: true, whitespace: true, message: '请输入会员姓名' },
                  { max: MEMBER_NAME_MAX_LENGTH, message: `姓名最多 ${MEMBER_NAME_MAX_LENGTH} 个字` }
                ]}
              >
                <Input maxLength={MEMBER_NAME_MAX_LENGTH} showCount placeholder="会员姓名" />
              </Form.Item>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入有效手机号' }
                ]}
              >
                <Input maxLength={11} placeholder="18800000001" />
              </Form.Item>
              <Form.Item name="branchId" label="门店" rules={[{ required: true, message: '请选择门店' }]}>
                <Select options={branches.map((branch) => ({ value: branch.id, label: branch.name }))} />
              </Form.Item>
              <div className="two-columns">
                <Form.Item
                  name="memberNo"
                  label="会员号"
                  rules={[{ max: MEMBER_NO_MAX_LENGTH, message: `会员号最多 ${MEMBER_NO_MAX_LENGTH} 个字` }]}
                >
                  <Input maxLength={MEMBER_NO_MAX_LENGTH} placeholder="E-001" />
                </Form.Item>
                <Form.Item
                  name="initialLessons"
                  label="初始课时"
                  rules={[{ type: 'number', min: 0, max: 999, message: '课时需在 0-999' }]}
                >
                  <InputNumber min={0} max={999} addonAfter="节" />
                </Form.Item>
              </div>
              <Form.Item
                name="wechatOpenid"
                label="微信 openid（高级）"
                rules={[{ max: 128, message: 'openid 最多 128 个字符' }]}
              >
                <Input placeholder="可选；通常建议创建后用 6 位绑定码绑定" />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  创建会员
                </Button>
                <Button onClick={resetMemberForm}>清空</Button>
              </Space>
            </Form>
          </div>
          <div className="panel">
            <div className="toolbar">
              <Input
                className="search-input"
                prefix={<Search size={16} />}
                placeholder="姓名、手机号或会员号"
                value={memberFilterDraft.q}
                onChange={(event) => setMemberFilterDraft({ q: event.target.value })}
                onPressEnter={() => void applyMemberFilters()}
              />
              <Button type="primary" icon={<Search size={16} />} onClick={() => void applyMemberFilters()} loading={loading}>
                查询
              </Button>
              <Button onClick={() => void resetMemberFilters()} disabled={loading}>
                重置
              </Button>
              <Button icon={<RefreshCw size={16} />} onClick={() => void refreshAll()} loading={loading}>
                刷新
              </Button>
            </div>
            <Table rowKey="id" columns={memberColumns} dataSource={members} loading={loading} pagination={{ pageSize: 8 }} />
          </div>
        </section>
      )
    },
    {
      key: 'coaches',
      label: '教练管理',
      children: (
        <section className="class-grid">
          <div className="panel">
            <div className="panel-title">
              <UserPlus size={18} />
              新建教练
            </div>
            <Form
              form={coachForm}
              layout="vertical"
              initialValues={{ branchId: selectedBranchId || branches[0]?.id }}
              onFinish={(values) => void submitCoach(values)}
            >
              <Form.Item
                name="displayName"
                label="姓名"
                rules={[
                  { required: true, whitespace: true, message: '请输入教练姓名' },
                  { max: COACH_NAME_MAX_LENGTH, message: `姓名最多 ${COACH_NAME_MAX_LENGTH} 个字` }
                ]}
              >
                <Input maxLength={COACH_NAME_MAX_LENGTH} showCount placeholder="王明" />
              </Form.Item>
              <Form.Item
                name="nickname"
                label="可见昵称"
                rules={[
                  { required: true, whitespace: true, message: '请输入可见昵称' },
                  { max: COACH_NICKNAME_MAX_LENGTH, message: `昵称最多 ${COACH_NICKNAME_MAX_LENGTH} 个字` }
                ]}
              >
                <Input maxLength={COACH_NICKNAME_MAX_LENGTH} showCount placeholder="Ming Coach" />
              </Form.Item>
              <Form.Item name="branchId" label="门店" rules={[{ required: true, message: '请选择门店' }]}>
                <Select options={branches.map((branch) => ({ value: branch.id, label: branch.name }))} />
              </Form.Item>
              <div className="two-columns">
                <Form.Item
                  name="username"
                  label="后台账号"
                  rules={[
                    { required: true, whitespace: true, message: '请输入后台账号' },
                    { min: 3, message: '账号至少 3 个字符' },
                    { max: COACH_USERNAME_MAX_LENGTH, message: `账号最多 ${COACH_USERNAME_MAX_LENGTH} 个字符` }
                  ]}
                >
                  <Input maxLength={COACH_USERNAME_MAX_LENGTH} placeholder="coach-ming" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="初始密码"
                  rules={[
                    { required: true, message: '请输入初始密码' },
                    { min: 8, message: '初始密码至少 8 位' }
                  ]}
                >
                  <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
                </Form.Item>
              </div>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入有效手机号' }]}
              >
                <Input maxLength={11} placeholder="18800000009" />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  创建教练
                </Button>
                <Button onClick={resetCoachForm}>清空</Button>
              </Space>
            </Form>
          </div>
          <div className="panel">
            <div className="toolbar">
              <Button icon={<RefreshCw size={16} />} onClick={() => void refreshAll()} loading={loading}>
                刷新
              </Button>
            </div>
            <Table rowKey="staffAssignmentId" columns={coachColumns} dataSource={coaches} loading={loading} pagination={{ pageSize: 8 }} />
          </div>
        </section>
      )
    },
    {
      key: 'bookings',
      label: '预约消课',
      children: (
        <section className="panel">
          <div className="toolbar">
            <Input
              className="search-input"
              prefix={<Search size={16} />}
              placeholder="会员、手机号或课程"
              value={bookingFilterDraft.q}
              onChange={(event) => setBookingFilterDraft((current) => ({ ...current, q: event.target.value }))}
              onPressEnter={() => void applyBookingFilters()}
            />
            <input
              className="native-input"
              type="date"
              value={bookingFilterDraft.date}
              onChange={(event) => setBookingFilterDraft((current) => ({ ...current, date: event.target.value }))}
            />
            <Select
              className="status-select"
              value={bookingFilterDraft.status}
              onChange={(value) => setBookingFilterDraft((current) => ({ ...current, status: value }))}
              options={[
                { value: '', label: '全部状态' },
                { value: 'BOOKED', label: '已预约' },
                { value: 'CANCELED', label: '已取消' }
              ]}
            />
            <Button type="primary" icon={<Search size={16} />} onClick={() => void applyBookingFilters()} loading={loading}>
              查询
            </Button>
            <Button onClick={() => void applyTodayBookingRoster()} loading={loading}>
              今日课程
            </Button>
            <Button onClick={handleExportBookingRoster} disabled={loading || bookings.length === 0}>
              导出名单
            </Button>
            <Button onClick={() => void resetBookingFilters()} disabled={loading}>
              重置
            </Button>
            <Button icon={<RefreshCw size={16} />} onClick={() => void refreshAll()} loading={loading}>
              刷新
            </Button>
          </div>
          <div className="class-roster-section">
            <div className="class-roster-header">
              <div>
                <div className="panel-title">课程预约名单</div>
                <div className="subtle">按课程聚合当前筛选下的有效预约；点击“今日课程”可快速查看今天到店名单。</div>
              </div>
              <Tag color="red">{todayRosterGroups.length} 节课</Tag>
            </div>
            <div className="class-roster-list">
              {todayRosterGroups.length === 0 ? (
                <div className="class-roster-empty">当前筛选暂无有效预约名单</div>
              ) : (
                todayRosterGroups.map((group) => {
                  const expanded = expandedRosterClassIds.includes(group.classId);
                  const pendingCount = group.bookings.filter(
                    (booking) => booking.attendanceStatus !== 'ATTENDED' && !booking.deductionId
                  ).length;

                  return (
                    <div className="class-roster-card" key={group.classId}>
                      <div className="class-roster-card__top">
                        <div className="class-roster-card__main">
                          <strong>{group.title}</strong>
                          <span className="subtle">
                            {dayjs(group.startsAt).format('MM月DD日 HH:mm')} · {group.coach}
                          </span>
                          <span className="subtle">{branchNameById.get(group.branchId) ?? '当前门店'}</span>
                        </div>
                        <div className="class-roster-card__meta">
                          <Tag color="green">{group.bookings.length} 人预约</Tag>
                          <Tag color={pendingCount > 0 ? 'gold' : 'default'}>{pendingCount} 人待消课</Tag>
                        </div>
                      </div>
                      <Button block onClick={() => toggleRosterClass(group.classId)}>
                        {expanded ? '收起名单' : '查看名单'}
                      </Button>
                      {expanded && (
                        <div className="roster-member-list">
                          {group.bookings.map((booking) => (
                            <div className="roster-member-item" key={booking.id}>
                              <div>
                                <strong>{booking.member.displayName}</strong>
                                <div className="subtle">{booking.member.phone || '未填手机号'}</div>
                              </div>
                              <Space wrap>
                                {statusTag(booking.attendanceStatus)}
                                <Button
                                  danger
                                  disabled={
                                    booking.status !== 'BOOKED' ||
                                    booking.attendanceStatus === 'ATTENDED' ||
                                    Boolean(booking.deductionId)
                                  }
                                  onClick={() => setDeductingBooking(booking)}
                                >
                                  消课
                                </Button>
                                <Button
                                  icon={<XCircle size={16} />}
                                  disabled={
                                    booking.status !== 'BOOKED' ||
                                    booking.attendanceStatus === 'ATTENDED' ||
                                    Boolean(booking.deductionId)
                                  }
                                  onClick={() => startCancelBooking(booking)}
                                >
                                  取消预约
                                </Button>
                              </Space>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <Table rowKey="id" columns={bookingColumns} dataSource={bookings} loading={loading} pagination={{ pageSize: 8 }} />
        </section>
      )
    },
    {
      key: 'classes',
      label: '课程管理',
      children: (
        <section className="class-grid">
          <div className="panel">
            <div className="panel-title">
              <CalendarPlus size={18} />
              {editingClass ? '编辑课程' : '新建课程'}
            </div>
            <Form form={classForm} layout="vertical" onFinish={(values) => void submitClass(values)}>
              <Form.Item
                name="title"
                label="课程名"
                rules={[
                  { required: true, whitespace: true, message: '请输入课程名' },
                  { max: CLASS_TITLE_MAX_LENGTH, message: `课程名最多 ${CLASS_TITLE_MAX_LENGTH} 个字` }
                ]}
              >
                <Input maxLength={CLASS_TITLE_MAX_LENGTH} showCount placeholder="基础拳击燃脂" />
              </Form.Item>
              <Form.Item name="branchId" label="门店" rules={[{ required: true, message: '请选择门店' }]}>
                <Select
                  disabled={Boolean(editingClass)}
                  options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                  onChange={() => {
                    classForm.setFieldsValue({ coachId: undefined, coach: undefined });
                  }}
                />
              </Form.Item>
              <Form.Item shouldUpdate={(previous, current) => previous.branchId !== current.branchId} noStyle>
                {(form) => {
                  const branchId = form.getFieldValue('branchId') as string | undefined;
                  const coachOptions = branchId ? coachOptionsByBranch.get(branchId) ?? [] : [];

                  return (
                    <Form.Item
                      name="coachId"
                      label="教练档案"
                      rules={[{ required: true, message: '选择教练档案' }]}
                    >
                      <Select
                        placeholder="选择教练档案"
                        options={coachOptions}
                        onChange={(coachId) => {
                          const selectedCoach = coaches.find(
                            (coach) => coach.id === coachId && coach.branchId === branchId
                          );
                          if (selectedCoach) {
                            form.setFieldsValue({
                              coach: selectedCoach.nickname || selectedCoach.displayName
                            });
                          }
                        }}
                      />
                    </Form.Item>
                  );
                }}
              </Form.Item>
              <Form.Item
                name="coach"
                label="展示教练名"
                rules={[
                  { required: true, whitespace: true, message: '请输入展示教练名' },
                  { max: CLASS_COACH_MAX_LENGTH, message: `教练名最多 ${CLASS_COACH_MAX_LENGTH} 个字` }
                ]}
              >
                <Input maxLength={CLASS_COACH_MAX_LENGTH} showCount placeholder="Coach Leo" />
              </Form.Item>
              <Form.Item
                name="startsAtLocal"
                label="上课时间"
                rules={[
                  { required: true, message: '请选择上课时间' },
                  {
                    validator: (_rule, value?: string) =>
                      !value || dayjs(value).isAfter(dayjs())
                        ? Promise.resolve()
                        : Promise.reject(new Error('上课时间必须晚于当前时间'))
                  }
                ]}
              >
                <input className="native-input full" type="datetime-local" />
              </Form.Item>
              <div className="two-columns">
                <Form.Item
                  name="durationMin"
                  label="时长"
                  rules={[
                    { required: true, message: '请输入时长' },
                    { type: 'number', min: 30, max: 240, message: '时长需在 30-240 分钟' }
                  ]}
                >
                  <InputNumber min={30} max={240} addonAfter="分钟" />
                </Form.Item>
                <Form.Item
                  name="capacity"
                  label="容量"
                  rules={[
                    { required: true, message: '请输入容量' },
                    { type: 'number', min: 1, max: 100, message: '容量需在 1-100 人' },
                    {
                      validator: (_rule, value?: number) => {
                        if (!editingClass || value === undefined || value >= editingClass.bookedCount) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error(`当前已有 ${editingClass.bookedCount} 人预约，容量不能低于预约数`));
                      }
                    }
                  ]}
                >
                  <InputNumber min={1} max={100} addonAfter="人" />
                </Form.Item>
              </div>
              <Form.Item
                name="description"
                label="说明"
                rules={[
                  { required: true, whitespace: true, message: '请输入说明' },
                  { max: CLASS_DESCRIPTION_MAX_LENGTH, message: `说明最多 ${CLASS_DESCRIPTION_MAX_LENGTH} 个字` }
                ]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={CLASS_DESCRIPTION_MAX_LENGTH}
                  showCount
                  placeholder="训练重点、适合人群、强度说明"
                />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading}>
                  {editingClass ? '保存课程' : '创建课程'}
                </Button>
                <Button onClick={startCreateClass}>清空</Button>
              </Space>
            </Form>
          </div>
          <div className="panel">
            <Table rowKey="id" columns={classColumns} dataSource={classes} loading={loading} pagination={{ pageSize: 8 }} />
          </div>
        </section>
      )
    },
    {
      key: 'deductions',
      label: '消课记录',
      children: (
        <section className="panel">
          <Table rowKey="id" columns={deductionColumns} dataSource={deductions} loading={loading} pagination={{ pageSize: 10 }} />
        </section>
      )
    },
    {
      key: 'notifications',
      label: '通知任务',
      children: (
        <section className="panel">
          <div className="toolbar">
            <Input
              className="search-input"
              prefix={<Search size={16} />}
              placeholder="会员、手机号、课程或门店"
              value={notificationFilterDraft.q}
              onChange={(event) => setNotificationFilterDraft((current) => ({ ...current, q: event.target.value }))}
              onPressEnter={() => void applyNotificationFilters()}
            />
            <Select
              className="status-select"
              value={notificationFilterDraft.status}
              onChange={(value) =>
                setNotificationFilterDraft((current) => ({ ...current, status: value as NotificationStatus | '' }))
              }
              options={[
                { value: '', label: '全部状态' },
                { value: 'PENDING', label: '待发送' },
                { value: 'SENT', label: '已发送' },
                { value: 'FAILED', label: '发送失败' },
                { value: 'SKIPPED', label: '已跳过' }
              ]}
            />
            <Button type="primary" icon={<Search size={16} />} onClick={() => void applyNotificationFilters()} loading={loading}>
              查询
            </Button>
            <Button onClick={() => void resetNotificationFilters()} disabled={loading}>
              重置
            </Button>
            <Button icon={<RefreshCw size={16} />} onClick={() => void refreshAll()} loading={loading}>
              刷新
            </Button>
          </div>
          <Table
            rowKey="id"
            columns={notificationColumns}
            dataSource={notificationJobs}
            loading={loading}
            pagination={{ pageSize: 8 }}
          />
        </section>
      )
    },
    {
      key: 'audit-logs',
      label: '审计日志',
      children: (
        <section className="panel">
          <div className="toolbar">
            <Input
              className="search-input"
              prefix={<Search size={16} />}
              placeholder="动作、对象、门店或操作者"
              value={auditLogFilterDraft.q}
              onChange={(event) => setAuditLogFilterDraft((current) => ({ ...current, q: event.target.value }))}
              onPressEnter={() => void applyAuditLogFilters()}
            />
            <Select
              className="status-select"
              value={auditLogFilterDraft.action}
              onChange={(value) =>
                setAuditLogFilterDraft((current) => ({ ...current, action: value as AuditAction | '' }))
              }
              options={[
                { value: '', label: '全部动作' },
                { value: 'CLASS_CREATE', label: '创建课程' },
                { value: 'CLASS_UPDATE', label: '编辑课程' },
                { value: 'CLASS_CANCEL', label: '取消课程' },
                { value: 'BOOKING_CANCEL', label: '取消预约' },
                { value: 'LESSON_DEDUCT', label: '消课' },
                { value: 'LESSON_ADJUST', label: '课时调整' },
                { value: 'NOTIFICATION_RETRY', label: '重试通知' },
                { value: 'MEMBER_CREATE', label: '创建会员' },
                { value: 'WECHAT_BIND', label: '绑定微信' },
                { value: 'WECHAT_UNBIND', label: '解绑微信' },
                { value: 'MEMBER_UPDATE', label: '更新会员资料' },
                { value: 'COACH_CREATE', label: '创建教练' },
                { value: 'COACH_UPDATE', label: '更新教练' }
              ]}
            />
            <Button type="primary" icon={<Search size={16} />} onClick={() => void applyAuditLogFilters()} loading={loading}>
              查询
            </Button>
            <Button onClick={() => void resetAuditLogFilters()} disabled={loading}>
              重置
            </Button>
            <Button icon={<RefreshCw size={16} />} onClick={() => void refreshAll()} loading={loading}>
              刷新
            </Button>
          </div>
          <Table rowKey="id" columns={auditLogColumns} dataSource={auditLogs} loading={loading} pagination={{ pageSize: 10 }} />
        </section>
      )
    }
  ];

  if (!isLoggedIn) {
    return (
      <main className="login-page">
        {contextHolder}
        <section className="login-panel">
          <div className="brand-mark">
            <Dumbbell size={28} />
          </div>
          <h1>拳馆约课后台</h1>
          <p>管理员工作台</p>
          <Form layout="vertical" onFinish={(values) => void handleLogin(values)} initialValues={{ username: 'admin' }}>
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      {contextHolder}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Dumbbell size={22} />
          </div>
          <div>
            <h1>拳馆约课后台</h1>
            <p>Booking Ops</p>
          </div>
        </div>
        <Space>
          <Tag icon={<ShieldCheck size={14} />} color="red">
            {user?.displayName}
          </Tag>
          <Button icon={<LogOut size={16} />} onClick={handleLogout}>
            退出
          </Button>
        </Space>
      </header>
      <section className="branch-bar">
        <div>
          <div className="branch-bar-label">门店范围</div>
          <div className="branch-bar-value">{selectedBranchName}</div>
        </div>
        <Select
          className="branch-select"
          value={selectedBranchId}
          options={branchOptions}
          disabled={loading || branchOptions.length <= 1}
          onChange={(value) => void handleBranchChange(value)}
        />
      </section>
      <section className="metrics-grid" aria-label="今日运营指标">
        {metricCards.map((card) => (
          <div className="metric-card" key={card.label}>
            <div className="metric-card__label">{card.label}</div>
            <div className="metric-card__value">{card.value}</div>
          </div>
        ))}
      </section>
      <Tabs className="work-tabs" items={tabItems} />
      <Modal
        title="确认消课"
        open={Boolean(deductingBooking)}
        okText="确认消课"
        cancelText="取消"
        okButtonProps={{ danger: true, loading }}
        onOk={() => void confirmDeduct()}
        onCancel={() => {
          setDeductingBooking(null);
          setDeductNote('');
        }}
      >
        <p>
          {deductingBooking?.member.displayName} / {deductingBooking?.boxingClass.title}
        </p>
        <p className="danger-copy">会扣减会员 1 节课时，确认前请核对会员和课程。</p>
        <Input.TextArea
          rows={3}
          placeholder="备注，例如：到店上课"
          value={deductNote}
          onChange={(event) => setDeductNote(event.target.value)}
        />
      </Modal>
      <Modal
        title="确认取消预约"
        open={Boolean(cancelingBooking)}
        okText="确认取消预约"
        cancelText="保留预约"
        okButtonProps={{ danger: true, loading }}
        onOk={() => void confirmCancelBooking()}
        onCancel={() => {
          setCancelingBooking(null);
          setCancelBookingReason('');
        }}
      >
        <p>
          {cancelingBooking?.member.displayName} / {cancelingBooking?.boxingClass.title}
        </p>
        <p className="danger-copy">会释放名额并跳过该预约的待发送提醒；不会扣减课时。</p>
        <Input.TextArea
          rows={3}
          placeholder="取消原因（可选），例如：会员临时请假"
          value={cancelBookingReason}
          onChange={(event) => setCancelBookingReason(event.target.value)}
        />
      </Modal>
      <Modal
        title="编辑教练资料"
        open={Boolean(editingCoach)}
        okText="保存资料"
        cancelText="取消"
        okButtonProps={{ loading }}
        onOk={() => void confirmUpdateCoach()}
        onCancel={() => {
          setEditingCoach(null);
          editCoachForm.resetFields();
        }}
      >
        <p>
          {editingCoach?.branchName} / {editingCoach?.username || '未设置账号'}
        </p>
        <Form form={editCoachForm} layout="vertical">
          <Form.Item
            name="displayName"
            label="姓名"
            rules={[
              { required: true, whitespace: true, message: '请输入教练姓名' },
              { max: COACH_NAME_MAX_LENGTH, message: `姓名最多 ${COACH_NAME_MAX_LENGTH} 个字` }
            ]}
          >
            <Input maxLength={COACH_NAME_MAX_LENGTH} showCount placeholder="王明" />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="可见昵称"
            rules={[
              { required: true, whitespace: true, message: '请输入可见昵称' },
              { max: COACH_NICKNAME_MAX_LENGTH, message: `昵称最多 ${COACH_NICKNAME_MAX_LENGTH} 个字` }
            ]}
          >
            <Input maxLength={COACH_NICKNAME_MAX_LENGTH} showCount placeholder="Ming Coach" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入有效手机号' }]}
          >
            <Input maxLength={11} placeholder="18800000009" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { value: 'ACTIVE', label: '启用' },
                { value: 'DISABLED', label: '停用' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="编辑会员资料"
        open={Boolean(editingMember)}
        okText="保存资料"
        cancelText="取消"
        okButtonProps={{ loading }}
        onOk={() => void confirmUpdateMember()}
        onCancel={() => {
          setEditingMember(null);
          editMemberForm.resetFields();
        }}
      >
        <p>
          {editingMember?.branchName} / 当前剩余 {editingMember?.lessonBalance.remaining ?? 0} 节
        </p>
        <Form form={editMemberForm} layout="vertical">
          <Form.Item
            name="displayName"
            label="姓名"
            rules={[
              { required: true, whitespace: true, message: '请输入会员姓名' },
              { max: MEMBER_NAME_MAX_LENGTH, message: `姓名最多 ${MEMBER_NAME_MAX_LENGTH} 个字` }
            ]}
          >
            <Input maxLength={MEMBER_NAME_MAX_LENGTH} showCount placeholder="会员姓名" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="手机号"
            rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入有效手机号' }]}
          >
            <Input maxLength={11} placeholder="18800000001" />
          </Form.Item>
          <Form.Item
            name="memberNo"
            label="会员号"
            rules={[{ max: MEMBER_NO_MAX_LENGTH, message: `会员号最多 ${MEMBER_NO_MAX_LENGTH} 个字` }]}
          >
            <Input maxLength={MEMBER_NO_MAX_LENGTH} placeholder="E-001" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="调整课时"
        open={Boolean(lessonAdjustingMember)}
        okText="确认调整"
        cancelText="取消"
        okButtonProps={{ loading }}
        onOk={() => void confirmLessonAdjustment()}
        onCancel={() => {
          setLessonAdjustingMember(null);
          lessonAdjustmentForm.resetFields();
        }}
      >
        <p>
          {lessonAdjustingMember?.displayName} / {lessonAdjustingMember?.branchName} / 当前{' '}
          {lessonAdjustingMember?.lessonBalance.remaining ?? 0} 节
        </p>
        <Form form={lessonAdjustmentForm} layout="vertical">
          <Form.Item
            name="delta"
            label="调整数量"
            rules={[
              { required: true, message: '请输入调整数量' },
              { type: 'number', min: -999, max: 999, message: '调整数量需在 -999 到 999 之间' },
              {
                validator: (_rule, value?: number) =>
                  value === 0 ? Promise.reject(new Error('调整数量不能为 0')) : Promise.resolve()
              }
            ]}
          >
            <InputNumber min={-999} max={999} addonAfter="节" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="原因"
            rules={[
              { required: true, whitespace: true, message: '请输入调整原因' },
              { max: 300, message: '原因最多 300 个字' }
            ]}
          >
            <Input.TextArea rows={3} maxLength={300} showCount placeholder="例如：购买新课包、人工纠错扣减" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="会员课时流水"
        open={Boolean(viewingLedgerMember)}
        footer={null}
        onCancel={() => {
          setViewingLedgerMember(null);
          setLessonLedgerEntries([]);
        }}
      >
        <p>
          {viewingLedgerMember?.displayName} / {viewingLedgerMember?.branchName} / 当前剩余{' '}
          {viewingLedgerMember?.lessonBalance.remaining ?? 0} 节
        </p>
        <div className="member-ledger-list">
          {lessonLedgerEntries.length === 0 ? (
            <div className="member-ledger-empty">暂无课时流水</div>
          ) : (
            lessonLedgerEntries.map((entry) => (
              <div className="member-ledger-entry" key={`${entry.type}-${entry.id}`}>
                <div className="member-ledger-entry__main">
                  <Space wrap>
                    {ledgerEntryTypeTag(entry)}
                    <Tag color={entry.delta > 0 ? 'green' : 'red'}>
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta} 节
                    </Tag>
                  </Space>
                  <strong>{entry.reason}</strong>
                  {entry.boxingClass && (
                    <span className="subtle">
                      {entry.boxingClass.title} · {entry.boxingClass.coach} ·{' '}
                      {dayjs(entry.boxingClass.startsAt).format('MM月DD日 HH:mm')}
                    </span>
                  )}
                </div>
                <div className="member-ledger-entry__meta">
                  <span>{dayjs(entry.createdAt).format('MM月DD日 HH:mm')}</span>
                  <span>{entry.admin.displayName}</span>
                  {entry.beforeRemaining !== null && entry.afterRemaining !== null && (
                    <span>
                      {entry.beforeRemaining} → {entry.afterRemaining} 节
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
      <Modal
        title="绑定微信"
        open={Boolean(bindingMember)}
        okText="确认绑定"
        cancelText="取消"
        okButtonProps={{ loading }}
        onOk={() => void confirmBindWechat()}
        onCancel={() => {
          setBindingMember(null);
          setBindOpenid('');
        }}
      >
        <p>
          {bindingMember?.displayName} / {bindingMember?.branchName}
        </p>
        <Input
          placeholder="输入 6 位绑定码，或直接输入 openid"
          value={bindOpenid}
          onChange={(event) => setBindOpenid(event.target.value)}
          onPressEnter={() => void confirmBindWechat()}
        />
      </Modal>
    </main>
  );
}
