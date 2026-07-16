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
 * Keeps your existing endpoint router files running without code alterations.
 */
export const query = async (text, params = []) => {
  const start = Date.now();
  try {
    // Call the custom underlying remote database proxy mapping function
    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: text,
      query_params: params
    });

    if (error) {
      throw error;
    }

    // Measure and log performance metrics automatically during development phases
    if (process.env.NODE_ENV !== 'production') {
      const duration = Date.now() - start;
      const cleanLine = text.trim().split('\n')[0];
      console.log('Executed SDK Query Stats:', { text: cleanLine, duration: `${duration}ms`, rows: data ? data.length : 0 });
    }

    // Format response parameters to mimic exactly what raw 'pg' modules output to routes
    return {
      rows: data || [],
      rowCount: data ? data.length : 0
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
