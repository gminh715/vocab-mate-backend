import { appConfig } from './app.config';

describe('appConfig', () => {
  const originalTimezone = process.env.ANALYTICS_TIMEZONE;

  afterEach(() => {
    if (originalTimezone === undefined) {
      delete process.env.ANALYTICS_TIMEZONE;
    } else {
      process.env.ANALYTICS_TIMEZONE = originalTimezone;
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
});
