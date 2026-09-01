const resolveAnalyticsTimezone = (): string => {
  const timezone = process.env.ANALYTICS_TIMEZONE?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new Error(`Invalid ANALYTICS_TIMEZONE: ${timezone}`);
  }
};

const resolveCorsOrigins = (): string[] => {
  const rawOrigins =
    process.env.CORS_ORIGIN ??
    process.env.ALLOWED_ORIGINS ??
    process.env.FRONTEND_URL;

  if (rawOrigins && rawOrigins.trim().length > 0) {
    return rawOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  return [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://vocab-mate.onrender.com',
  ];
};

export const appConfig = () => ({
  port: Number(process.env.PORT ?? 3000),
  analyticsTimezone: resolveAnalyticsTimezone(),
  corsOrigins: resolveCorsOrigins(),
});

export type ReturnTypeOfAppConfig = ReturnType<typeof appConfig>;
