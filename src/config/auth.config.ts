export type CookieSameSite = 'lax' | 'strict' | 'none';

export interface AuthConfig {
  accessSecret: string;
  accessExpiresInSeconds: number;
  refreshSecret: string;
  refreshExpiresInSeconds: number;
  bcryptRounds: number;
  cookieSecure: boolean;
  cookieSameSite: CookieSameSite;
}

const requiredSecret = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }

  return value;
};

const positiveInteger = (name: string, defaultValue?: number): number => {
  const rawValue = process.env[name]?.trim();

  if (!rawValue && defaultValue !== undefined) {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
};

const booleanValue = (name: string, defaultValue: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false`);
  }

  return value === 'true';
};

const cookieSameSite = (): CookieSameSite => {
  const value = process.env.COOKIE_SAME_SITE?.trim().toLowerCase() ?? 'lax';

  if (value !== 'lax' && value !== 'strict' && value !== 'none') {
    throw new Error('COOKIE_SAME_SITE must be lax, strict, or none');
  }

  return value;
};

export const authConfig = (): AuthConfig => ({
  accessSecret: requiredSecret('JWT_ACCESS_SECRET'),
  accessExpiresInSeconds: positiveInteger('JWT_ACCESS_EXPIRES_IN', 900),
  refreshSecret: requiredSecret('JWT_REFRESH_SECRET'),
  refreshExpiresInSeconds: positiveInteger('JWT_REFRESH_EXPIRES_IN', 604800),
  bcryptRounds: positiveInteger('BCRYPT_ROUNDS', 12),
  cookieSecure: booleanValue(
    'COOKIE_SECURE',
    process.env.NODE_ENV === 'production',
  ),
  cookieSameSite: cookieSameSite(),
});
