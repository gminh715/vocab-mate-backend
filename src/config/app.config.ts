const resolveAnalyticsTimezone = (): string => {
  const timezone = process.env.ANALYTICS_TIMEZONE?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new Error(`Invalid ANALYTICS_TIMEZONE: ${timezone}`);
  }
};

export const appConfig = () => ({
  port: Number(process.env.PORT ?? 3000),
  analyticsTimezone: resolveAnalyticsTimezone(),
});

export type ReturnTypeOfAppConfig = ReturnType<typeof appConfig>;
