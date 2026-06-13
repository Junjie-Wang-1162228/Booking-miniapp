export type MemberKey = 'member-a' | 'member-b' | 'member-c';
export type BookingStatus = 'BOOKED' | 'CANCELED';
export type AttendanceStatus = 'PENDING' | 'ATTENDED';
export type ClassStatus = 'SCHEDULED' | 'CANCELED';

export type AuthUser = {
  id: string;
  role: 'USER' | 'ADMIN';
  displayName: string;
  phone: string | null;
  lessonBalance: { remaining: number } | null;
  accessibleBranches: MemberBranch[];
  defaultBranchId: string | null;
};

export type MemberBranch = {
  id: string;
  gymId: string;
  name: string;
  address: string | null;
  phone: string | null;
  memberNo: string | null;
  isDefault: boolean;
  lessonBalance: { remaining: number };
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type BoxingClass = {
  id: string;
  gymId: string;
  branchId: string;
  branchName: string | null;
  title: string;
  coach: string;
  coachId: string | null;
  startsAt: string;
  durationMin: number;
  capacity: number;
  remainingSpots: number;
  bookedCount: number;
  isBookedByMe: boolean;
  status: ClassStatus;
  description: string;
};

export type Booking = {
  id: string;
  gymId: string;
  branchId: string;
  status: BookingStatus;
  attendanceStatus: AttendanceStatus;
  canceledAt: string | null;
  createdAt: string;
  canCancel: boolean;
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    branchId: string;
    coachId: string | null;
    startsAt: string;
    durationMin: number;
    status: ClassStatus;
    description: string;
  };
};

export type Deduction = {
  id: string;
  gymId: string;
  branchId: string;
  bookingId: string;
  amount: number;
  note: string | null;
  createdAt: string;
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    branchId: string;
    startsAt: string;
  };
};
