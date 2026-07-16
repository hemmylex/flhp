// src/server.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet'; // Enforces essential automated production security headers
import { v2 as cloudinary } from 'cloudinary';

import { pool } from './db/pool.js'; // Pull down pool instance cleanly to monitor lifecycles
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import electionRoutes from './routes/elections.js';
import candidateRoutes from './routes/candidates.js';
import notificationRoutes from './routes/notifications.js';
import cloudinaryRoutes from './routes/cloudinary.js';

// 1. Enforce strict variable verification maps upon application bootstrap
const REQUIRED_ENV = [
  'DATABASE_URL', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'
];
REQUIRED_ENV.forEach(variable => {
  if (!process.env[variable]) {
    console.error(`FATAL STRUCTURAL EXCEPTION: Mandatory configuration parameter [process.env.${variable}] is missing.`);
    process.exit(1);
  }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

// 2. Harden application transport frameworks using specialized security abstractions
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow media loads from verified domains
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

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
      return callback(new Error(`Security Block: Origin [${origin}] is not authorized by CORS configuration rules.`));
    }
  },
  credentials: true, // Absolutely mandatory to let browsers pass http-only JWT session cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));

// Basic telemetry endpoint
app.get('/health', (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

// Register unified security routing vectors
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cloudinary', cloudinaryRoutes);

// 4. Robust Global Centralized Exception Interceptor Middleware
app.use((err, _req, res, _next) => {
  console.error('CRITICAL APP FAULT INTERCEPTED:', err.stack || err);
  
  // Mask underlying system logs (like raw SQL query printouts) to shield server details
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
  console.log(` VoteFlow Secure Core Core Engine Engine Active`);
  console.log(` Local Network Endpoint Target: http://localhost:${port}`);
  console.log(` Environment Context Mode Mapping: ${process.env.NODE_ENV || 'development'}`);
  
  // Highlighted Fix: Explicit database connectivity handshake test
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
  
  // Stop receiving any incoming HTTP server tracking threads immediately
  server.close(async () => {
    console.log('HTTP network interface safely locked out.');
    try {
      // Disconnect connections inside the active postgres client pool
      await pool.end();
      console.log('Database connection pool successfully disconnected.');
      process.exit(0);
    } catch (dbCloseError) {
      console.error('Error encountered while closing the database client pool connection socket:', dbCloseError);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => closeSystemGracefully('SIGTERM'));
process.on('SIGINT', () => closeSystemGracefully('SIGINT'));
