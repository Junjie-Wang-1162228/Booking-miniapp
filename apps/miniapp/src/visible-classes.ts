import { getAdminClasses, getClasses } from './api';
import type { LoadedMemberSession } from './member-session';
import type { AdminClass, BoxingClass } from './types';

export function toVisibleAdminClass(item: AdminClass): BoxingClass {
  return {
    ...item,
    isBookedByMe: false
  };
}

export async function loadVisibleClasses(session: LoadedMemberSession, branchId: string) {
  if (session.user.role === 'ADMIN') {
    const adminClasses = await getAdminClasses(session.token, branchId);
    return adminClasses.map(toVisibleAdminClass);
  }

  return getClasses(session.token, branchId);
}
