import mysql from 'mysql2/promise';

const getMySQLHost = () => {
  return process.env.DB_HOST || 'localhost';
};

const pool = mysql.createPool({
  host: getMySQLHost(),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'limbo_health',
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

export { pool, getMySQLHost };