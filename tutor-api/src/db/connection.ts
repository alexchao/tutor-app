import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

// Create a separate connection pool for Drizzle
export const pool = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'dbos',
  database: process.env.PGDATABASE ?? 'tutorappdevdb',
});

// Create Drizzle database instance with schema
export const db = drizzle(pool, { schema });

