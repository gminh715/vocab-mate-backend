import { databaseConfig } from './database.config';

describe('databaseConfig', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }

    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('reads and trims DATABASE_URL', () => {
    process.env.DATABASE_URL =
      '  postgresql://user:pass@localhost:5432/vocab  ';

    expect(databaseConfig()).toEqual({
      url: 'postgresql://user:pass@localhost:5432/vocab',
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    delete process.env.DATABASE_URL;

    expect(() => databaseConfig()).toThrow('DATABASE_URL is required');
  });

  it('rejects a non-PostgreSQL URL', () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/vocab';

    expect(() => databaseConfig()).toThrow(
      'DATABASE_URL must use the postgres or postgresql protocol',
    );
  });

  it('rejects an invalid URL', () => {
    process.env.DATABASE_URL = 'not a URL';

    expect(() => databaseConfig()).toThrow(
      'DATABASE_URL must be a valid PostgreSQL connection URL',
    );
  });
});
