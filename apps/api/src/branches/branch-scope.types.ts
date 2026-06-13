import { StaffRole } from '@prisma/client';

export type BranchAccessRole = StaffRole;

export type BranchView = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
};

export type MemberBranchView = BranchView & {
  memberNo: string | null;
  isDefault: boolean;
  lessonBalance: { remaining: number };
};

export type AdminBranchView = BranchView & {
  staffRole: BranchAccessRole;
};

export type AdminBranchScope = {
  isOwner: boolean;
  branchIds: string[];
};

export type AdminBranchRoleScope = AdminBranchScope & {
  ownerBranchIds: string[];
  managerBranchIds: string[];
  coachBranchIds: string[];
  managementBranchIds: string[];
  coachOnlyBranchIds: string[];
};
