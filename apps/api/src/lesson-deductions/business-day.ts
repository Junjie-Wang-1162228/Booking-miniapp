const DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES = 480;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type ConfigReader = {
  get(key: string): string | undefined;
};

export function resolveBusinessTimezoneOffsetMinutes(config: ConfigReader) {
  const configured = Number(config.get('BUSINESS_TIMEZONE_OFFSET_MINUTES'));
  if (!Number.isInteger(configured) || configured < -720 || configured > 840) {
    return DEFAULT_BUSINESS_TIMEZONE_OFFSET_MINUTES;
  }
  return configured;
}

export function businessDayUtcRange(date: string, offsetMinutes: number) {
  const match = DATE_ONLY_PATTERN.exec(date);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const startMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0) - offsetMinutes * 60 * 1000;

  return {
    start: new Date(startMs),
    end: new Date(startMs + 24 * 60 * 60 * 1000)
  };
}
