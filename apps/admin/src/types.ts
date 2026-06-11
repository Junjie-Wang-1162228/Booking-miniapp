export type Role = 'USER' | 'ADMIN';
export type BookingStatus = 'BOOKED' | 'CANCELED';
export type AttendanceStatus = 'PENDING' | 'ATTENDED';
export type ClassStatus = 'SCHEDULED' | 'CANCELED';
export type StaffRole = 'OWNER' | 'MANAGER' | 'COACH';

export type AdminBranch = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
  staffRole: StaffRole;
};

export type AuthUser = {
  id: string;
  role: Role;
  displayName: string;
  phone: string | null;
  lessonBalance: { remaining: number } | null;
  accessibleBranches: AdminBranch[];
  defaultBranchId: string | null;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type CreateClassInput = {
  branchId: string;
  title: string;
  coach: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  description: string;
};

export type AdminClass = CreateClassInput & {
  id: string;
  gymId: string;
  branchName: string | null;
  coachId: string | null;
  remainingSpots: number;
  bookedCount: number;
  status: ClassStatus;
};

export type AdminBooking = {
  id: string;
  gymId: string;
  branchId: string;
  status: BookingStatus;
  attendanceStatus: AttendanceStatus;
  deductionId: string | null;
  createdAt: string;
  canceledAt: string | null;
  member: {
    id: string;
    displayName: string;
    phone: string | null;
  };
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    branchId: string;
    coachId: string | null;
    startsAt: string;
    durationMin: number;
    status: ClassStatus;
  };
};

export type Deduction = {
  id: string;
  gymId: string;
  branchId: string;
  bookingId: string;
  userId: string;
  adminId: string;
  amount: number;
  note: string | null;
  createdAt: string;
  member: {
    id: string;
    displayName: string;
    phone: string | null;
  };
  admin: {
    id: string;
    displayName: string;
  };
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    branchId: string;
    startsAt: string;
  };
};
