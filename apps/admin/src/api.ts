import {
  AdminAuditLog,
  AdminBooking,
  AdminBranch,
  AdminClass,
  AdminCoach,
  AdminDailyMetrics,
  AdminMember,
  AdminNotificationJob,
  AdjustMemberLessonsInput,
  AdjustMemberLessonsResponse,
  AuthResponse,
  BindMemberWechatInput,
  CreateClassInput,
  CreateCoachInput,
  CreateMemberInput,
  Deduction,
  AuditAction,
  LessonLedgerResponse,
  NotificationStatus,
  UnbindMemberWechatInput,
  UpdateCoachInput,
  UpdateMemberInput
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(' / ') : body.message;
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`
});

export function loginAdmin(username: string, password: string) {
  return requestJson<AuthResponse>('/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export function getAdminBranches(token: string) {
  return requestJson<AdminBranch[]>('/admin/branches', {
    headers: authHeaders(token)
  });
}

export function getAdminMembers(token: string, filters: { branchId?: string; q?: string }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return requestJson<AdminMember[]>(`/admin/members${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
}

export function getAdminCoaches(token: string, filters: { branchId?: string; q?: string }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return requestJson<AdminCoach[]>(`/admin/coaches${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
}

export function createCoach(token: string, input: CreateCoachInput) {
  return requestJson<AdminCoach>('/admin/coaches', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function updateCoach(token: string, id: string, input: UpdateCoachInput) {
  return requestJson<AdminCoach>(`/admin/coaches/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function createMember(token: string, input: CreateMemberInput) {
  return requestJson<AdminMember>('/admin/members', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function updateMember(token: string, id: string, input: UpdateMemberInput) {
  return requestJson<AdminMember>(`/admin/members/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function bindMemberWechat(token: string, id: string, input: BindMemberWechatInput) {
  return requestJson<AdminMember>(`/admin/members/${id}/wechat-bind`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function unbindMemberWechat(token: string, id: string, input: UnbindMemberWechatInput) {
  return requestJson<AdminMember>(`/admin/members/${id}/wechat-unbind`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function adjustMemberLessons(token: string, id: string, input: AdjustMemberLessonsInput) {
  return requestJson<AdjustMemberLessonsResponse>(`/admin/members/${id}/lesson-adjustments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function getAdminMemberLessonLedger(token: string, id: string, branchId: string) {
  return requestJson<LessonLedgerResponse>(
    `/admin/members/${id}/lesson-ledger?branchId=${encodeURIComponent(branchId)}`,
    {
      headers: authHeaders(token)
    }
  );
}

export function getAdminBookings(
  token: string,
  filters: { branchId?: string; date?: string; q?: string; status?: string }
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return requestJson<AdminBooking[]>(`/admin/bookings${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
}

export function cancelAdminBooking(token: string, id: string, reason?: string) {
  return requestJson<AdminBooking>(`/admin/bookings/${id}/cancel`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ reason })
  });
}

export function getAdminDeductions(token: string, branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return requestJson<Deduction[]>(`/admin/deductions${query}`, {
    headers: authHeaders(token)
  });
}

export function getAdminDailyMetrics(token: string, filters: { branchId?: string; date?: string }) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return requestJson<AdminDailyMetrics>(`/admin/metrics/daily${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
}

export function getAdminNotifications(
  token: string,
  filters: { branchId?: string; status?: NotificationStatus | ''; q?: string }
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return requestJson<AdminNotificationJob[]>(`/admin/notifications${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
}

export function retryNotification(token: string, id: string) {
  return requestJson<AdminNotificationJob>(`/admin/notifications/${id}/retry`, {
    method: 'POST',
    headers: authHeaders(token)
  });
}

export function getAdminAuditLogs(
  token: string,
  filters: { branchId?: string; action?: AuditAction | ''; q?: string }
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return requestJson<AdminAuditLog[]>(`/admin/audit-logs${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
}

export function getAdminClasses(token: string, branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return requestJson<AdminClass[]>(`/admin/classes${query}`, {
    headers: authHeaders(token)
  });
}

export function createClass(token: string, input: CreateClassInput) {
  return requestJson<AdminClass>('/admin/classes', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function updateClass(token: string, id: string, input: Partial<CreateClassInput>) {
  return requestJson<AdminClass>(`/admin/classes/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
}

export function cancelClass(token: string, id: string) {
  return requestJson<AdminClass>(`/admin/classes/${id}/cancel`, {
    method: 'POST',
    headers: authHeaders(token)
  });
}

export function deductBooking(token: string, bookingId: string, note?: string) {
  return requestJson<Deduction>(`/admin/bookings/${bookingId}/deduct`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ note })
  });
}
