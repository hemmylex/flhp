// db.js
import pkg from 'pg';
const { Pool } = pkg;

const connectDB = async () => {
  try {
    const pool = new Pool({
      user: process.env.PG_USER,
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      password: process.env.PG_PASSWORD,
      port: process.env.PG_PORT || 5432,
    });

    // Test the connection
    const res = await pool.query('SELECT NOW()');
    console.log(`PostgreSQL Connected: ${res.rows[0].now}`);

    return pool;
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
