import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Add readings to the database
export const addReading = async (timestamp: number, name: string, value: number) => {
  const query = 'INSERT INTO readings (timestamp, metric_name, metric_value) VALUES ($1, $2, $3)';
  await pool.query(query, [timestamp, name, value]);
};

// Retrieve readings from the database for a specific date range
export const getReading = async (from: number, to: number) => {
  const query = 'SELECT * FROM readings WHERE timestamp >= $1 AND timestamp <= $2';
  const { rows } = await pool.query(query, [from, to]);
  return rows;
};