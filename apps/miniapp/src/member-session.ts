import { devLogin, getMe, getStoredMember, getStoredToken, loginWithConfiguredAuth } from './api';
import { resolveSelectedMemberBranch } from './branch-session';
import { AuthUser, MemberBranch, MemberKey } from './types';

export const memberNames: Record<MemberKey, string> = {
  'member-a': '阿杰',
  'member-b': '小林',
  'member-c': '东店同学'
};

export const developmentMembers: MemberKey[] = ['member-a', 'member-b', 'member-c'];

export type LoadedMemberSession = {
  token: string;
  user: AuthUser;
  branches: MemberBranch[];
  selectedBranchId: string;
  selectedBranch: MemberBranch | null;
};

function resolveLoadedSession(token: string, user: AuthUser, preferredBranchId?: string): LoadedMemberSession {
  const branchSession = resolveSelectedMemberBranch(user, preferredBranchId);

  return {
    token,
    user,
    branches: branchSession.accessibleBranches,
    selectedBranchId: branchSession.selectedBranchId,
    selectedBranch: branchSession.selectedBranch
  };
}

export async function loadMemberSession(options: {
  token?: string;
  preferredBranchId?: string;
  member?: MemberKey;
} = {}): Promise<LoadedMemberSession> {
  const storedToken = options.token || getStoredToken();
  if (storedToken) {
    const user = await getMe(storedToken);
    return resolveLoadedSession(storedToken, user, options.preferredBranchId);
  }

  const session = await loginWithConfiguredAuth(options.member ?? getStoredMember());
  return resolveLoadedSession(session.accessToken, session.user, options.preferredBranchId);
}

export async function switchDevelopmentMember(member: MemberKey): Promise<LoadedMemberSession> {
  const session = await devLogin(member);
  return resolveLoadedSession(session.accessToken, session.user);
}
