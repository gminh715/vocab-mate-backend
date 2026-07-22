export interface DatabaseConfig {
  url: string;
}

export const databaseConfig = (): DatabaseConfig => {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  let protocol: string;

  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(
      'DATABASE_URL must use the postgres or postgresql protocol',
    );
  }

  return { url };
};
