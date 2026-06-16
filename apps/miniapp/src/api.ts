import Taro from '@tarojs/taro';
import {
  AdminBooking,
  AdminClass,
  AdminClassInput,
  AdminDailyMetrics,
  AdminMember,
  AuthResponse,
  Booking,
  BoxingClass,
  Deduction,
  MemberBranch,
  MemberKey
} from './types';

const API_BASE = __API_BASE_URL__;
const AUTH_MODE = __AUTH_MODE__;
const WECHAT_SUBSCRIBE_TEMPLATE_ID = __WECHAT_SUBSCRIBE_TEMPLATE_ID__;
const WECHAT_BOOKING_CREATED_TEMPLATE_ID = __WECHAT_BOOKING_CREATED_TEMPLATE_ID__;
const TOKEN_KEY = 'member_token';
const MEMBER_KEY = 'member_key';
const BRANCH_KEY = 'selected_branch_id';
const REQUEST_TIMEOUT_MS = 10000;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  data?: unknown;
  token?: string;
};

type ErrorResponse = {
  message?: string | string[];
  bindingRequired?: boolean;
  bindingCode?: string;
  bindingCodeExpiresAt?: string;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly data: ErrorResponse
  ) {
    super(message);
    this.name = 'ApiRequestError';
    Object.setPrototypeOf(this, ApiRequestError.prototype);
  }
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await Taro.request<T>({
    url: `${API_BASE}${path}`,
    method: options.method || 'GET',
    data: options.data,
    timeout: REQUEST_TIMEOUT_MS,
    header: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    }
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const data = response.data as ErrorResponse;
    const message = Array.isArray(data?.message) ? data.message.join(' / ') : data?.message;
    throw new ApiRequestError(message || `请求失败：${response.statusCode}`, response.statusCode, data);
  }

  return response.data;
}

export function formatApiError(error: unknown, fallback: string) {
  const data =
    typeof error === 'object' && error && 'data' in error ? (error as { data?: ErrorResponse }).data : undefined;

  if (data?.bindingRequired && data.bindingCode) {
    return `微信未绑定会员。绑定码：${data.bindingCode}，请发给拳馆管理员完成绑定。`;
  }

  return normalizeRequestError(error, fallback);
}

export function normalizeRequestError(error: unknown, fallback: string) {
  const message = requestErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('timeout')) {
    return '请求超时，请检查网络后重试';
  }

  if (normalized.includes('request:fail') || normalized.includes('network') || normalized.includes('fail')) {
    return '网络连接不稳定，请稍后重试';
  }

  return message || fallback;
}

function requestErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error && 'errMsg' in error) {
    return String((error as { errMsg?: unknown }).errMsg || '');
  }

  return '';
}

export function getStoredToken() {
  return Taro.getStorageSync<string>(TOKEN_KEY) || '';
}

export function clearStoredToken() {
  Taro.removeStorageSync(TOKEN_KEY);
}

export function getStoredMember(): MemberKey {
  return (Taro.getStorageSync<MemberKey>(MEMBER_KEY) || 'member-a') as MemberKey;
}

export function getStoredBranchId() {
  return Taro.getStorageSync<string>(BRANCH_KEY) || '';
}

export function setStoredBranchId(branchId: string) {
  Taro.setStorageSync(BRANCH_KEY, branchId);
}

function storeSession(response: AuthResponse) {
  Taro.setStorageSync(TOKEN_KEY, response.accessToken);
  const defaultBranchId = response.user.defaultBranchId || response.user.accessibleBranches[0]?.id;
  if (defaultBranchId) {
    setStoredBranchId(defaultBranchId);
  }
}

export function isDevAuthMode() {
  return AUTH_MODE === 'dev';
}

export type ReminderSubscriptionResult = 'accepted' | 'rejected' | 'unavailable';
export type BookingSubscriptionResult = {
  bookingConfirmationAccepted: boolean;
  classReminderAccepted: boolean;
};

export async function requestClassReminderSubscription(): Promise<ReminderSubscriptionResult> {
  if (isDevAuthMode()) {
    return 'accepted';
  }

  if (!WECHAT_SUBSCRIBE_TEMPLATE_ID) {
    return 'unavailable';
  }

  try {
    const result = await Taro.requestSubscribeMessage({
      tmplIds: [WECHAT_SUBSCRIBE_TEMPLATE_ID]
    });
    return result[WECHAT_SUBSCRIBE_TEMPLATE_ID] === 'accept' ? 'accepted' : 'rejected';
  } catch {
    return 'rejected';
  }
}

export async function requestBookingSubscriptions(reminderEnabled: boolean): Promise<BookingSubscriptionResult> {
  if (isDevAuthMode()) {
    return {
      bookingConfirmationAccepted: Boolean(WECHAT_BOOKING_CREATED_TEMPLATE_ID),
      classReminderAccepted: reminderEnabled
    };
  }

  const tmplIds = [
    WECHAT_BOOKING_CREATED_TEMPLATE_ID,
    ...(reminderEnabled ? [WECHAT_SUBSCRIBE_TEMPLATE_ID] : [])
  ].filter((templateId, index, allTemplateIds) => templateId && allTemplateIds.indexOf(templateId) === index);

  if (tmplIds.length === 0) {
    return { bookingConfirmationAccepted: false, classReminderAccepted: false };
  }

  try {
    const result = await Taro.requestSubscribeMessage({ tmplIds });
    return {
      bookingConfirmationAccepted:
        Boolean(WECHAT_BOOKING_CREATED_TEMPLATE_ID) && result[WECHAT_BOOKING_CREATED_TEMPLATE_ID] === 'accept',
      classReminderAccepted:
        reminderEnabled && Boolean(WECHAT_SUBSCRIBE_TEMPLATE_ID) && result[WECHAT_SUBSCRIBE_TEMPLATE_ID] === 'accept'
    };
  } catch {
    return { bookingConfirmationAccepted: false, classReminderAccepted: false };
  }
}

export async function devLogin(member: MemberKey) {
  const response = await requestJson<AuthResponse>('/auth/dev-login', {
    method: 'POST',
    data: { member }
  });
  storeSession(response);
  Taro.setStorageSync(MEMBER_KEY, member);
  return response;
}

export async function wechatLogin() {
  const login = await Taro.login();
  if (!login.code) {
    throw new Error('微信登录失败，请重新进入小程序');
  }
  const response = await requestJson<AuthResponse>('/auth/wechat-login', {
    method: 'POST',
    data: { code: login.code }
  });
  storeSession(response);
  return response;
}

export function loginWithConfiguredAuth(member: MemberKey = getStoredMember()) {
  if (isDevAuthMode()) {
    return devLogin(member);
  }
  return wechatLogin();
}

export function getMe(token: string) {
  return requestJson<AuthResponse['user']>('/auth/me', { token });
}

export function getMemberBranches(token: string) {
  return requestJson<MemberBranch[]>('/branches/me', { token });
}

export function getClasses(token: string, branchId: string) {
  return requestJson<BoxingClass[]>(`/classes?branchId=${encodeURIComponent(branchId)}`, { token });
}

export function createBooking(
  token: string,
  classId: string,
  branchId: string,
  options: { remindBeforeMinutes?: number; bookingConfirmationSubscribed?: boolean } = {}
) {
  return requestJson<Booking>('/bookings', {
    method: 'POST',
    token,
    data: { classId, branchId, ...options }
  });
}

export function getMyBookings(token: string, branchId: string) {
  return requestJson<Booking[]>(`/bookings/me?branchId=${encodeURIComponent(branchId)}`, { token });
}

export function cancelBooking(token: string, bookingId: string) {
  return requestJson<Booking>(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    token
  });
}

export function getMyDeductions(token: string, branchId: string) {
  return requestJson<Deduction[]>(`/deductions/me?branchId=${encodeURIComponent(branchId)}`, { token });
}

function queryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export function getAdminDailyMetrics(token: string, filters: { branchId?: string; date?: string }) {
  return requestJson<AdminDailyMetrics>(`/admin/metrics/daily${queryString(filters)}`, { token });
}

export function getAdminClasses(token: string, branchId?: string) {
  return requestJson<AdminClass[]>(`/admin/classes${queryString({ branchId })}`, { token });
}

export function createAdminClass(token: string, input: AdminClassInput) {
  return requestJson<AdminClass>('/admin/classes', {
    method: 'POST',
    token,
    data: input
  });
}

export function updateAdminClass(token: string, id: string, input: Partial<AdminClassInput>) {
  return requestJson<AdminClass>(`/admin/classes/${id}`, {
    method: 'PATCH',
    token,
    data: input
  });
}

export function cancelAdminClass(token: string, id: string) {
  return requestJson<AdminClass>(`/admin/classes/${id}/cancel`, {
    method: 'POST',
    token
  });
}

export function getAdminBookings(
  token: string,
  filters: { branchId?: string; date?: string; status?: 'BOOKED' | 'CANCELED'; q?: string } = {}
) {
  return requestJson<AdminBooking[]>(`/admin/bookings${queryString(filters)}`, { token });
}

export function deductAdminBooking(token: string, bookingId: string, note?: string) {
  return requestJson<Deduction>(`/admin/bookings/${bookingId}/deduct`, {
    method: 'POST',
    token,
    data: { note }
  });
}

export function cancelAdminBooking(token: string, bookingId: string, reason?: string) {
  return requestJson<AdminBooking>(`/admin/bookings/${bookingId}/cancel`, {
    method: 'POST',
    token,
    data: { reason }
  });
}

export function getAdminMembers(token: string, filters: { branchId?: string; q?: string } = {}) {
  return requestJson<AdminMember[]>(`/admin/members${queryString(filters)}`, { token });
}

export function bindAdminMemberWechat(token: string, id: string, input: { branchId: string; bindingCode: string }) {
  return requestJson<AdminMember>(`/admin/members/${id}/wechat-bind`, {
    method: 'POST',
    token,
    data: input
  });
}
