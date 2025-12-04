import dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

/**
 * Creates a Drizzle configuration object based on a provided .env file path
 */
export function createDrizzleConfig(envPath: string): Config {
  console.log('envPath', envPath);
  // Load environment variables from specified env file
  dotenv.config({ path: envPath, override: true });

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const host = process.env.PGHOST ?? 'localhost';
  const port = Number(process.env.PGPORT ?? 5432);
  const user = process.env.PGUSER ?? 'postgres';
  const password = process.env.PGPASSWORD ?? 'dbos';
  const database = process.env.PGDATABASE ?? 'tutorappdevdb';
  const ssl = process.env.APP_ENV === 'production' ? true : false;

  return {
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
      host,
      port,
      user,
      password,
      database,
      ssl
    },
  } satisfies Config;
}