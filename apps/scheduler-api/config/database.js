import mysql from 'mysql2/promise';

const getMySQLHost = () => {
  return process.env.DB_HOST || 'localhost';
};

const pool = mysql.createPool({
  host: getMySQLHost(),
  user: 'user',
  password: 'password',
  database: 'limbo_health',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

export { pool, getMySQLHost };