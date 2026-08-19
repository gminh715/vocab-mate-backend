import { authConfig } from '../../../src/config/auth.config';

const variableNames = [
  'JWT_ACCESS_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
  'BCRYPT_ROUNDS',
  'COOKIE_SECURE',
  'COOKIE_SAME_SITE',
  'NODE_ENV',
] as const;

describe('authConfig', () => {
  const originalValues = Object.fromEntries(
    variableNames.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'access-secret-at-least-32-characters-long';
    process.env.JWT_REFRESH_SECRET =
      'different-refresh-secret-at-least-32-characters';
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
    delete process.env.BCRYPT_ROUNDS;
    delete process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SAME_SITE;
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    for (const name of variableNames) {
      const value = originalValues[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('builds separate access, refresh, hashing, and cookie configuration', () => {
    expect(authConfig()).toMatchObject({
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604800,
      bcryptRounds: 12,
      cookieSameSite: 'lax',
    });
  });

  it('uses a secure cross-site refresh cookie by default in production', () => {
    process.env.NODE_ENV = 'production';

    expect(authConfig()).toMatchObject({
      cookieSecure: true,
      cookieSameSite: 'none',
    });
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const)(
    'fails when %s is missing',
    (name) => {
      delete process.env[name];
      expect(() => authConfig()).toThrow(`${name} is required`);
    },
  );

  it('rejects invalid cookie configuration', () => {
    process.env.COOKIE_SAME_SITE = 'invalid';
    expect(() => authConfig()).toThrow(
      'COOKIE_SAME_SITE must be lax, strict, or none',
    );
  });
});
