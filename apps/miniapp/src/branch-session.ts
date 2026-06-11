import { getStoredBranchId, setStoredBranchId } from './api';
import { AuthUser, MemberBranch } from './types';

export type SelectedMemberBranch = {
  selectedBranchId: string;
  selectedBranch: MemberBranch | null;
  accessibleBranches: MemberBranch[];
};

export function resolveSelectedMemberBranch(user: AuthUser, preferredBranchId = getStoredBranchId()): SelectedMemberBranch {
  const accessibleBranches = user.accessibleBranches;
  const selectedBranch =
    accessibleBranches.find((branch) => branch.id === preferredBranchId) ??
    accessibleBranches.find((branch) => branch.id === user.defaultBranchId) ??
    accessibleBranches.find((branch) => branch.isDefault) ??
    accessibleBranches[0] ??
    null;

  if (selectedBranch) {
    setStoredBranchId(selectedBranch.id);
  }

  return {
    selectedBranchId: selectedBranch?.id ?? '',
    selectedBranch,
    accessibleBranches
  };
}
