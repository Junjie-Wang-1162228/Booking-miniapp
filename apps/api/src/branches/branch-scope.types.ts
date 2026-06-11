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
