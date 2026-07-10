// server.js
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import pool from "./config/db.js";

const PORT = Number(process.env.PORT) || 8080;

// Start the HTTP server first so Render remains healthy
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0:${PORT}`);
});

// Check the database connection separately via the API Bridge
async function connectDatabase() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected via API Bridge");
    console.log("Database time:", result.rows[0]?.now || "Checked");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed via API Bridge");
    console.error(err.message);
  }
}

connectDatabase();
