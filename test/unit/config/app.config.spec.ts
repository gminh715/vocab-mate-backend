import { appConfig } from '../../../src/config/app.config';

describe('appConfig', () => {
  const originalTimezone = process.env.ANALYTICS_TIMEZONE;
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (originalTimezone === undefined) {
      delete process.env.ANALYTICS_TIMEZONE;
    } else {
      process.env.ANALYTICS_TIMEZONE = originalTimezone;
    }

    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalCorsOrigin;
    }
  });

  it('defaults analytics bucketing to UTC', () => {
    delete process.env.ANALYTICS_TIMEZONE;
    expect(appConfig().analyticsTimezone).toBe('UTC');
  });

  it('accepts a valid IANA analytics timezone', () => {
    process.env.ANALYTICS_TIMEZONE = 'Asia/Ho_Chi_Minh';
    expect(appConfig().analyticsTimezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('rejects an invalid analytics timezone', () => {
    process.env.ANALYTICS_TIMEZONE = 'not-a-timezone';
    expect(() => appConfig()).toThrow('Invalid ANALYTICS_TIMEZONE');
  });

  it('provides default CORS origins including local and deployed FE', () => {
    delete process.env.CORS_ORIGIN;
    expect(appConfig().corsOrigins).toEqual([
      'http://localhost:5173',
      'http://localhost:3000',
      'https://vocab-mate.onrender.com',
    ]);
  });

  it('parses comma-separated CORS_ORIGIN environment variable', () => {
    process.env.CORS_ORIGIN =
      'https://custom-domain.com, http://localhost:5173 ';
    expect(appConfig().corsOrigins).toEqual([
      'https://custom-domain.com',
      'http://localhost:5173',
    ]);
  });
});
