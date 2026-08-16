import { migrate } from 'postgres-migrations';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  const dbConfig = {
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
  };

  const client = new pg.Client(dbConfig);
  await client.connect();

  try {
    console.log('Running migrations');
    await migrate({ client }, './src/db/migrations');
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

runMigrations();
