CREATE DATABASE IF NOT EXISTS boxing_booking_shadow;
GRANT ALL PRIVILEGES ON boxing_booking.* TO 'booking_user'@'%';
GRANT ALL PRIVILEGES ON boxing_booking_shadow.* TO 'booking_user'@'%';
FLUSH PRIVILEGES;
