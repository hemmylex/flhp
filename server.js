// src/server.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet'; // Enforces essential automated production security headers
import rateLimit from 'express-rate-limit';

// Updated database abstraction bridge pattern hooking straight to your SDK file
import { query } from './db/pool.js'; 
const pool = {
  query: (text, params) => query(text, params),
  end: async () => {
    console.log('Supabase HTTP abstraction layer mock pool disconnected safely.');
    return Promise.resolve();
  }
};

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import electionRoutes from './routes/elections.js';
import candidateRoutes from './routes/candidates.js';
import notificationRoutes from './routes/notifications.js';
import storageRoutes from './routes/supabase-storage.js'; // Replaced Cloudinary routing pointer

// 1. Enforce strict variable verification maps upon application bootstrap
const REQUIRED_ENV = [
  'PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'
];
REQUIRED_ENV.forEach(variable => {
  if (!process.env[variable]) {
    console.error(`FATAL STRUCTURAL EXCEPTION: Mandatory configuration parameter [process.env.${variable}] is missing.`);
    process.exit(1);
  }
});

const app = express();

// 2. Harden application transport frameworks using specialized security abstractions
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow media loads from verified domains
}));

app.use(express.json({ limit: '5mb' })); // Increased headroom slightly for base64/binary image buffers
app.use(cookieParser());

// Anti-bombardment layer to protect stateless database RPC methods from starvation
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, 
  message: { error: 'Traffic volume threshold exceeded. Please try again shortly.' }
});
app.use('/api/', limiter);

// 3. Dynamic Multi-Origin CORS Whitelist Configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,              // Your production app public domain URL (Next.js client)
  'http://localhost:3000',               // Standard default Next.js local development address
  'http://localhost:5173'                // Backwards fallback support context parameters
].filter(Boolean);                       // Strip out undefined values cleanly

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server or programmatic non-browser requests (like health checks or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      const corsError = new Error(`Security Block: Origin [${origin}] is not authorized by CORS configuration rules.`);
      corsError.status = 403;
      return callback(corsError);
    }
  },
  credentials: true, // Absolutely mandatory to let browsers pass http-only JWT session cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200 // Resolves legacy browser preflight OPTIONS response drops
}));

// Basic telemetry endpoint
app.get('/health', (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// Register unified security routing vectors
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/storage', storageRoutes); // Updated routing vector mapped away from Cloudinary

// 4. Robust Global Centralized Exception Interceptor Middleware
app.use((err, _req, res, _next) => {
  console.error('CRITICAL APP FAULT INTERCEPTED:', err.stack || err);
  
  // Mask underlying system logs to shield server details
  const isProduction = process.env.NODE_ENV === 'production';
  const responseMessage = isProduction 
    ? 'A secure core infrastructure execution fault occurred.' 
    : err.message || 'Internal Server Error';

  res.status(err.status || 500).json({ 
    error: responseMessage,
    ...(isProduction ? {} : { debugStack: err.stack }) 
  });
});

const port = process.env.PORT || 4000;
const server = app.listen(port, async () => {
  console.log(`=======================================================`);
  console.log(` VoteFlow Secure Core Engine Active [Supabase SDK Mode]`);
  console.log(` Local Network Endpoint Target: http://localhost:${port}`);
  console.log(` Environment Context Mode Mapping: ${process.env.NODE_ENV || 'development'}`);
  
  // Handshake test over the REST interface wrapper
  try {
    const start = Date.now();
    await pool.query('SELECT NOW()');
    console.log(` Database Connection Status: CONNECTED (${Date.now() - start}ms)`);
  } catch (dbError) {
    console.error(`\nCRITICAL: Database connection configuration verification failed!`);
    console.error(`Reason: ${dbError.message}`);
    console.log(`=======================================================`);
    
    // Shut down the server container instantly to avoid unhandled async request drops
    server.close(() => {
      process.exit(1);
    });
    return;
  }
  
  console.log(`=======================================================`);
});

// 5. Graceful Termination Lifecycle Orchestration
const closeSystemGracefully = async (signal) => {
  console.log(`\nIntercepted closing signal [${signal}]. Launching secure shutdown operations...`);
  
  // Force a hard termination if active requests prevent a graceful exit
  setTimeout(() => {
    console.error('Forcefully terminating process: Graceful shutdown timed out.');
    process.exit(1);
  }, 10000);

  // Stop receiving any incoming HTTP server tracking threads immediately
  server.close(async () => {
    console.log('HTTP network interface safely locked out.');
    try {
      // Safely triggers our custom SDK mock end-routine
      await pool.end();
      console.log('Database abstraction layer successfully disconnected.');
      process.exit(0);
    } catch (dbCloseError) {
      console.error('Error encountered while closing the database client pool connection socket:', dbCloseError);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => closeSystemGracefully('SIGTERM'));
process.on('SIGINT', () => closeSystemGracefully('SIGINT'));

// Intercept unexpected promise rejections to prevent silent data drop crashes
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED PROMISE REJECTION ENCOUNTERED:', reason);
  closeSystemGracefully('UNHANDLED_REJECTION');
});
