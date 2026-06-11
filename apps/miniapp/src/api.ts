import Taro from '@tarojs/taro';
import { AuthResponse, Booking, BoxingClass, Deduction, MemberBranch, MemberKey } from './types';

const API_BASE = __API_BASE_URL__;
const AUTH_MODE = __AUTH_MODE__;
const TOKEN_KEY = 'member_token';
const MEMBER_KEY = 'member_key';
const BRANCH_KEY = 'selected_branch_id';

type RequestOptions = {
  method?: 'GET' | 'POST';
  data?: unknown;
  token?: string;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await Taro.request<T>({
    url: `${API_BASE}${path}`,
    method: options.method || 'GET',
    data: options.data,
    header: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    }
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const data = response.data as { message?: string | string[] };
    const message = Array.isArray(data?.message) ? data.message.join(' / ') : data?.message;
    throw new Error(message || `请求失败：${response.statusCode}`);
  }

  return response.data;
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

export function createBooking(token: string, classId: string, branchId: string, remindBeforeMinutes?: number) {
  return requestJson<Booking>('/bookings', {
    method: 'POST',
    token,
    data: { classId, branchId, ...(remindBeforeMinutes ? { remindBeforeMinutes } : {}) }
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
