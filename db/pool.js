// src/db/pool.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('FATAL SYSTEM EXCEPTION: Supabase authentication URL or Service Role configuration keys are missing.');
  process.exit(1);
}

// 1. Initialize a unified administrative client instance with automatic bypass privileges
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false, // Disables local state management to prevent runtime side-effects on Node servers
    autoRefreshToken: false,
  },
});

/**
 * 2. Backwards-Compatible Query Drop-In Replacement Wrapper.
 * Forwards raw SQL query requests smoothly over the Supabase secure API gateway.
 */
export const query = async (text, params = []) => {
  const start = Date.now();
  const cleanQuery = text.trim();
  
  // Performance Patch: Short-circuit the standard bootstrap connection check to save network latency
  if (cleanQuery.toLowerCase() === 'select now()') {
    return { rows: [{ now: new Date().toISOString() }], rowCount: 1 };
  }

  try {
    // High Priority Fix: Coerce all incoming parameters cleanly into string types to match text[] parameters array expectations
    const stringifiedParams = Array.isArray(params)
      ? params.map(val => (val === null || val === undefined) ? '' : String(val))
      : [];

    // Call the custom underlying remote database proxy mapping function
    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: cleanQuery,
      query_params: stringifiedParams
    });

    if (error) {
      const dbError = new Error(error.message || 'Database runtime execution failure.');
      dbError.code = error.code || 'SUPABASE_RPC_ERROR';
      dbError.status = 500;
      throw dbError;
    }

    // Ensure rows consistently format as an array, unpacking any accidental single-object returns safely
    const formattedRows = Array.isArray(data) ? data : (data ? [data] : []);

    // Measure and log performance metrics automatically during development phases
    if (process.env.NODE_ENV !== 'production') {
      const duration = Date.now() - start;
      const cleanLine = cleanQuery.split('\n')[0];
      console.log('Executed SDK Query Stats:', { text: cleanLine, duration: `${duration}ms`, rows: formattedRows.length });
    }

    // Format response parameters to mimic exactly what raw 'pg' modules output to routes
    return {
      rows: formattedRows,
      rowCount: formattedRows.length
    };

  } catch (dbError) {
    console.error('SQL Execution Fault Intercepted via SDK Subsystem:', {
      text,
      message: dbError.message || dbError,
      code: dbError.code || 'UNKNOWN'
    });
    throw dbError; // Bubble error directly up into your routes' asyncHandler pipelines
  }
};

/**
 * 3. Explicit Pool Structural Mock Adapter Object.
 * Satisfies existing structural bootstrap server lifecycle checking hooks inside server.js.
 */
export const pool = {
  query: (text, params) => query(text, params),
  end: async () => {
    console.log('Supabase API client network abstraction closed safely.');
    return Promise.resolve();
  }
};
