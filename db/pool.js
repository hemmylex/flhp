// src/db/pool.js
import pg from 'pg';
import 'dotenv/config';

// 1. Configure production-ready Pool settings
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  
  // Connection Pool management rules
  max: 20, // Maintain a ceiling of 20 active clients in the pool to protect system memory
  idleTimeoutMillis: 30000, // Close idle database clients automatically after 30 seconds
  connectionTimeoutMillis: 4000, // Crash quickly (4s) instead of stalling if database goes down
};

// 2. Automatically apply SSL encryption configurations when running in production
if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = {
    rejectUnauthorized: false // Required for managed services like Supabase/Neon/Heroku
  };
}

export const pool = new pg.Pool(poolConfig);

// 3. Critically Important: Global event listener to keep Node from crashing if an active socket drops
pool.on('error', (err) => {
  console.error('CRITICAL: Unexpected idle database client connection pool exception:', err.message);
});

/**
 * Standard utility query executor wrapper.
 * Logs query stats during development to ensure zero un-indexed lookups.
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    
    // Optional development logging to check execution speeds across your ballot queries
    if (process.env.NODE_ENV !== 'production') {
      const duration = Date.now() - start;
      console.log('Executed Query Stats:', { text: text.trim().split('\n')[0], duration: `${duration}ms`, rows: res.rowCount });
    }
    
    return res;
  } catch (dbError) {
    console.error('SQL Execution Fault Intercepted:', { text, message: dbError.message, code: dbError.code });
    throw dbError; // Bubble up cleanly into your handlers' asyncHandler blocks
  }
};
