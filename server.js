import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import pool from "./config/db.js";

const PORT = Number(process.env.PORT) || 8080;

// Start the HTTP server first
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});

// Check the database connection separately
async function connectDatabase() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected");
    console.log("Database time:", result.rows[0].now);
  } catch (err) {
    console.error("❌ PostgreSQL connection failed");
    console.error(err);

    // Keep the server running so Render sees an open port.
    // Your application can retry later or return appropriate
    // errors for endpoints that require the database.
  }
}

connectDatabase();
