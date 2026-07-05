// db.js
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT || 5432,
  // Add this block to fix external cloud connection handshakes
  ssl: {
    rejectUnauthorized: false, 
  },
});

export default pool;
