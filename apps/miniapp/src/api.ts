import Taro from '@tarojs/taro';
import { AuthResponse, Booking, BoxingClass, Deduction, MemberKey } from './types';

const API_BASE = process.env.TARO_APP_API_BASE_URL || 'http://localhost:4000';
const TOKEN_KEY = 'member_token';
const MEMBER_KEY = 'member_key';

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

export function getStoredMember(): MemberKey {
  return (Taro.getStorageSync<MemberKey>(MEMBER_KEY) || 'member-a') as MemberKey;
}

export async function devLogin(member: MemberKey) {
  const response = await requestJson<AuthResponse>('/auth/dev-login', {
    method: 'POST',
    data: { member }
  });
  Taro.setStorageSync(TOKEN_KEY, response.accessToken);
  Taro.setStorageSync(MEMBER_KEY, member);
  return response;
}

export function getMe(token: string) {
  return requestJson<AuthResponse['user']>('/auth/me', { token });
}

export function getClasses(token: string) {
  return requestJson<BoxingClass[]>('/classes', { token });
}

export function createBooking(token: string, classId: string, remindBeforeMinutes?: number) {
  return requestJson<Booking>('/bookings', {
    method: 'POST',
    token,
    data: { classId, ...(remindBeforeMinutes ? { remindBeforeMinutes } : {}) }
  });
}

export function getMyBookings(token: string) {
  return requestJson<Booking[]>('/bookings/me', { token });
}

export function cancelBooking(token: string, bookingId: string) {
  return requestJson<Booking>(`/bookings/${bookingId}/cancel`, {
    method: 'POST',
    token
  });
}

export function getMyDeductions(token: string) {
  return requestJson<Deduction[]>('/deductions/me', { token });
}
