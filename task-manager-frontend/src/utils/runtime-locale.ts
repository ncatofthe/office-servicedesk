let runtimeLocale = 'ru-RU';
let runtimeTimezone = 'Europe/Moscow';

export const setRuntimeLocale = (locale: string, timezone: string) => {
  try {
    runtimeLocale = new Intl.Locale(locale).toString();
  } catch {
    runtimeLocale = 'ru-RU';
  }

  try {
    new Intl.DateTimeFormat(runtimeLocale, { timeZone: timezone }).format();
    runtimeTimezone = timezone;
  } catch {
    runtimeTimezone = 'Europe/Moscow';
  }
};

export const getRuntimeDateFormat = () => ({
  locale: runtimeLocale,
  timezone: runtimeTimezone,
});
