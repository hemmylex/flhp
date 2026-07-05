import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Pool } = pkg;
import app from "./app.js";

const PORT = process.env.PORT || 5000;

/* =========================
   DATABASE CONNECTION
========================= */
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT || 5432,
});

pool
  .connect()
  .then(async (client) => {
    try {
      const res = await client.query("SELECT NOW()");
      console.log(`PostgreSQL connected at: ${res.rows[0].now}`);
      client.release();

      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    } catch (err) {
      console.error("Database test query failed:", err.message);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("PostgreSQL connection failed");
    console.error(err.message);
    process.exit(1);
  });
