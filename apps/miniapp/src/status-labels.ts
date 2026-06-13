import { AttendanceStatus, BookingStatus, ClassStatus } from './types';

const classStatusLabels: Record<ClassStatus, string> = {
  SCHEDULED: '可预约',
  CANCELED: '已取消'
};

const bookingStatusLabels: Record<BookingStatus, string> = {
  BOOKED: '已预约',
  CANCELED: '已取消'
};

const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  PENDING: '待上课',
  ATTENDED: '已到课消课'
};

export function classStatusLabel(status: ClassStatus) {
  return classStatusLabels[status];
}

export function bookingStatusLabel(status: BookingStatus) {
  return bookingStatusLabels[status];
}

export function attendanceStatusLabel(status: AttendanceStatus) {
  return attendanceStatusLabels[status];
}
