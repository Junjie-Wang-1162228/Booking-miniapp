export type MemberKey = 'member-a' | 'member-b';
export type BookingStatus = 'BOOKED' | 'CANCELED';
export type AttendanceStatus = 'PENDING' | 'ATTENDED';
export type ClassStatus = 'SCHEDULED' | 'CANCELED';

export type AuthUser = {
  id: string;
  role: 'USER' | 'ADMIN';
  displayName: string;
  phone: string | null;
  lessonBalance: { remaining: number } | null;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type BoxingClass = {
  id: string;
  title: string;
  coach: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  remainingSpots: number;
  bookedCount: number;
  status: ClassStatus;
  description: string;
};

export type Booking = {
  id: string;
  status: BookingStatus;
  attendanceStatus: AttendanceStatus;
  canceledAt: string | null;
  createdAt: string;
  canCancel: boolean;
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    startsAt: string;
    durationMin: number;
    status: ClassStatus;
    description: string;
  };
};

export type Deduction = {
  id: string;
  bookingId: string;
  amount: number;
  note: string | null;
  createdAt: string;
  boxingClass: {
    id: string;
    title: string;
    coach: string;
    startsAt: string;
  };
};
