export const DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES = 480;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ONLY_PATTERN = /^(\d{2}):(\d{2})$/;

export function resolveBusinessTimezoneOffsetMinutes(value: string | number | undefined) {
  const configured = Number(value);
  if (!Number.isInteger(configured) || configured < -720 || configured > 840) {
    return DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES;
  }
  return configured;
}

export function formatBusinessDate(date = new Date(), offsetMinutes = DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES) {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

export function businessDateKeyForIso(value: string, offsetMinutes = DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES) {
  return formatBusinessDate(new Date(value), offsetMinutes);
}

export function toBusinessDateTimeParts(value: string, offsetMinutes = DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES) {
  const shifted = new Date(new Date(value).getTime() + offsetMinutes * 60 * 1000);
  const iso = shifted.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
  };
}

export function parseBusinessDateTime(
  dateValue: string,
  timeValue: string,
  offsetMinutes = DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES
) {
  const dateMatch = DATE_ONLY_PATTERN.exec(dateValue);
  const timeMatch = TIME_ONLY_PATTERN.exec(timeValue);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);

  if (hourNumber > 23 || minuteNumber > 59) {
    return null;
  }

  const localMs = Date.UTC(yearNumber, monthNumber - 1, dayNumber, hourNumber, minuteNumber, 0, 0);
  const localDate = new Date(localMs);
  const validDate =
    localDate.getUTCFullYear() === yearNumber &&
    localDate.getUTCMonth() === monthNumber - 1 &&
    localDate.getUTCDate() === dayNumber;

  if (!validDate) {
    return null;
  }

  return new Date(localMs - offsetMinutes * 60 * 1000);
}
