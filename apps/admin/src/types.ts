export type Role = 'USER' | 'ADMIN';
export type BookingStatus = 'BOOKED' | 'CANCELED';
export type AttendanceStatus = 'PENDING' | 'ATTENDED';
export type ClassStatus = 'SCHEDULED' | 'CANCELED';
export type StaffRole = 'OWNER' | 'MANAGER' | 'COACH';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type NotificationJobType = 'BOOKING_CREATED' | 'CLASS_REMINDER' | 'CLASS_CANCELED' | 'CLASS_RESCHEDULED';
export type AuditAction =
  | 'CLASS_CREATE'
  | 'CLASS_UPDATE'
  | 'CLASS_CANCEL'
  | 'BOOKING_CANCEL'
  | 'LESSON_DEDUCT'
  | 'LESSON_ADJUST'
  | 'NOTIFICATION_RETRY'
  | 'MEMBER_CREATE'
  | 'WECHAT_BIND'
  | 'WECHAT_UNBIND'
  | 'MEMBER_UPDATE'
  | 'COACH_CREATE'
  | 'COACH_UPDATE';

export type AdminBranch = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
  staffRole: StaffRole;
};

export type AuthUser = {
  id: string;
  role: Role;
  displayName: string;
  phone: string | null;
  lessonBalance: { remaining: number } | null;
  accessibleBranches: AdminBranch[];
  defaultBranchId: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type CreateMemberInput = {
  branchId: string;
  displayName: string;
  phone?: string;
  memberNo?: string;
  initialLessons?: number;
  wechatOpenid?: string;
};

export type UpdateMemberInput = {
  branchId: string;
  displayName?: string;
  phone?: string;
  memberNo?: string;
};

export type BindMemberWechatInput = {
  branchId: string;
  wechatOpenid?: string;
  bindingCode?: string;
};

export type UnbindMemberWechatInput = {
  branchId: string;
};

export type AdjustMemberLessonsInput = {
  branchId: string;
  delta: number;
  reason: string;
};

export type CreateCoachInput = {
  branchId: string;
  displayName: string;
  nickname: string;
  username: string;
  password: string;
  phone?: string;
};

export type UpdateCoachInput = {
  branchId: string;
  displayName?: string;
  nickname?: string;
  phone?: string;
  status?: 'ACTIVE' | 'DISABLED';
};

export type AdminCoach = {
  id: string;
  staffAssignmentId: string;
  gymId: string;
  branchId: string;
  branchName: string;
  displayName: string;
  nickname: string | null;
  username: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
};

export type AdminMember = {
  id: string;
  branchId: string;
  branchName: string;
  displayName: string;
  phone: string | null;
  memberNo: string | null;
  status: string;
  joinedAt: string;
  lessonBalance: { remaining: number };
  wechatBound: boolean;
};

export type LessonBalanceAdjustment = {
  id: string;
  gymId: string;
  branchId: string;
  userId: string;
  adminId: string;
  delta: number;
  beforeRemaining: number;
  afterRemaining: number;
  reason: string;
  createdAt: string;
};

export type AdjustMemberLessonsResponse = {
  member: AdminMember;
  adjustment: LessonBalanceAdjustment;
};

export type LessonLedgerEntry = {
  id: string;
  type: 'ADJUSTMENT' | 'DEDUCTION';
  branchId: string;
  userId: string;
  adminId: string;
  bookingId?: string;
  delta: number;
  beforeRemaining: number | null;
  afterRemaining: number | null;
  reason: string;
  createdAt: string;
  admin: {
    id: string;
    displayName: string;
  };
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    startsAt: string;
  } | null;
};

export type LessonLedgerResponse = {
  member: AdminMember;
  entries: LessonLedgerEntry[];
};

export type CreateClassInput = {
  branchId: string;
  coachId?: string;
  title: string;
  coach: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  description: string;
};

export type AdminClass = CreateClassInput & {
  id: string;
  gymId: string;
  branchName: string | null;
  coachId: string | null;
  remainingSpots: number;
  bookedCount: number;
  status: ClassStatus;
};

export type AdminBooking = {
  id: string;
  gymId: string;
  branchId: string;
  status: BookingStatus;
  attendanceStatus: AttendanceStatus;
  deductionId: string | null;
  createdAt: string;
  canceledAt: string | null;
  member: {
    id: string;
    displayName: string;
    phone: string | null;
  };
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    branchId: string;
    coachId: string | null;
    startsAt: string;
    durationMin: number;
    status: ClassStatus;
  };
};

export type Deduction = {
  id: string;
  gymId: string;
  branchId: string;
  bookingId: string;
  userId: string;
  adminId: string;
  amount: number;
  note: string | null;
  createdAt: string;
  member: {
    id: string;
    displayName: string;
    phone: string | null;
  };
  admin: {
    id: string;
    displayName: string;
  };
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    branchId: string;
    startsAt: string;
  };
};

export type AdminDailyMetrics = {
  date: string;
  branchIds: string[];
  bookingCreatedCount: number;
  bookingCanceledCount: number;
  lessonDeductedCount: number;
  fullClassCount: number;
};

export type AdminNotificationJob = {
  id: string;
  gymId: string;
  branchId: string;
  branchName: string;
  bookingId: string;
  userId: string;
  type: NotificationJobType;
  status: NotificationStatus;
  scheduledAt: string;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  member: {
    id: string;
    displayName: string;
    phone: string | null;
  };
  boxingClass: {
    id: string;
    title: string;
    startsAt: string;
    branchId: string;
  };
  latestLog: {
    id: string;
    status: NotificationStatus;
    message: string;
    createdAt: string;
  } | null;
  logCount: number;
};

export type AdminAuditLog = {
  id: string;
  gymId: string;
  branchId: string;
  branchName: string;
  adminId: string;
  admin: {
    id: string;
    displayName: string;
  };
  action: AuditAction;
  entityType: string;
  entityId: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};
