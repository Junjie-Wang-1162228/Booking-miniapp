import { AdminBooking, AdminBranch, AdminClass, AuthResponse, CreateClassInput, Deduction } from './types';

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

export function getAdminDeductions(token: string, branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return requestJson<Deduction[]>(`/admin/deductions${query}`, {
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
