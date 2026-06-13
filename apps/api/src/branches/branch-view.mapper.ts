import { AdminBranchView, MemberBranchView } from './branch-scope.types';

type BranchRecord = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
};

export function toMemberBranchView(input: {
  memberNo: string | null;
  isDefault: boolean;
  branch: BranchRecord;
  lessonBalance: { remaining: number } | null;
}): MemberBranchView {
  return {
    id: input.branch.id,
    gymId: input.branch.gymId,
    name: input.branch.name,
    address: input.branch.address,
    phone: input.branch.phone,
    memberNo: input.memberNo,
    isDefault: input.isDefault,
    lessonBalance: { remaining: input.lessonBalance?.remaining ?? 0 }
  };
}

export function toAdminBranchView(input: {
  role: AdminBranchView['staffRole'];
  branch: BranchRecord;
}): AdminBranchView {
  return {
    id: input.branch.id,
    gymId: input.branch.gymId,
    name: input.branch.name,
    address: input.branch.address,
    phone: input.branch.phone,
    staffRole: input.role
  };
}
