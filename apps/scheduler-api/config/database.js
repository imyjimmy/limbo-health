import mysql from 'mysql2/promise';

const getMySQLHost = () => {
  // Container name varies by environment
  if (process.env.NODE_ENV === 'production') {
    return 'mgitreposerver-mgit-repo-server_plebdoc_mysql_1';
  }
  return 'mgit-repo-server_plebdoc_mysql_1';
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