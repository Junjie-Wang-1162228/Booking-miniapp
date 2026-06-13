CREATE DATABASE IF NOT EXISTS boxing_booking_shadow;
CREATE DATABASE IF NOT EXISTS boxing_booking_e2e;
GRANT ALL PRIVILEGES ON `boxing\_booking`.* TO 'booking_user'@'%';
GRANT ALL PRIVILEGES ON `boxing\_booking\_shadow`.* TO 'booking_user'@'%';
GRANT ALL PRIVILEGES ON `boxing\_booking\_e2e`.* TO 'booking_user'@'%';
FLUSH PRIVILEGES;
