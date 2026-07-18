// server.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet'; 
import rateLimit from 'express-rate-limit';

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
import storageRoutes from './routes/supabase-storage.js'; 

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

// High Priority Fix: Explicitly instruct Express to trust Render's cloud reverse proxy infrastructure layers.
// This resolves the 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR' validation crash.
app.set('trust proxy', 1);

// 1. Deep Active Telemetry Endpoint (Placed ABOVE security layers to guarantee rapid platform pings)
app.get('/health', async (_req, res) => {
  const start = Date.now();
  
  try {
    // Force a strict gateway timeout fallback check to prevent hanging connection states
    const dbCheckPromise = pool.query('SELECT NOW()');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database handshake timed out')), 3000)
    );

    // Race the query execution against our 3-second timeout window
    await Promise.race([dbCheckPromise, timeoutPromise]);

    return res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start
    });

  } catch (err) {
    console.error('HEALTH CHECK FAILURE:', err.message || err);
    
    // Return a 503 Service Unavailable code to force platform routing layers to isolate this instance
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Upstream data service layer connection verification failed.'
    });
  }
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, 
}));

app.use(express.json({ limit: '5mb' })); 
app.use(cookieParser());

// Anti-bombardment layer restricted exclusively to sensitive domain route clusters
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 200, 
  message: { error: 'Traffic volume threshold exceeded. Please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// 2. Optimized Multi-Origin CORS Whitelist Configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,              
  'https://cesa-vote.vercel.app',               
  'https://cesa-vote.vercel.app'                
].filter(Boolean);                       

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const corsError = new Error('CORS Policy Restriction: Origin Unauthorized.');
    corsError.status = 403;
    return callback(corsError);
  },
  credentials: true, 
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200 
}));

// Register unified security routing vectors
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/storage', storageRoutes); 

app.use((err, _req, res, _next) => {
  console.error('CRITICAL APP FAULT INTERCEPTED:', err.stack || err);
  
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
// 3. Bind server explicitly to 0.0.0.0 to unlock external routing access across Render's proxy
const server = app.listen(port, '0.0.0.0', async () => {
  console.log(`=======================================================`);
  console.log(` VoteFlow Secure Core Engine Active [Supabase SDK Mode]`);
  console.log(` Network Boundary Host Interface Bound: 0.0.0.0:${port}`);
  console.log(` Environment Context Mode Mapping: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    const start = Date.now();
    await pool.query('SELECT NOW()');
    console.log(` Database Connection Status: CONNECTED (${Date.now() - start}ms)`);
  } catch (dbError) {
    console.error(`\nCRITICAL: Database connection configuration verification failed!`);
    console.error(`Reason: ${dbError.message}`);
    console.log(`=======================================================`);
    server.close(() => { process.exit(1); });
    return;
  }
  console.log(`=======================================================`);
});

const closeSystemGracefully = async (signal) => {
  console.log(`\nIntercepted closing signal [${signal}]. Launching secure shutdown operations...`);
  
  setTimeout(() => {
    console.error('Forcefully terminating process: Graceful shutdown timed out.');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    console.log('HTTP network interface safely locked out.');
    try {
      await pool.end();
      console.log('Database abstraction layer successfully disconnected.');
      process.exit(0);
    } catch (dbCloseError) {
      console.error('Error encountered while closing the database client connection socket:', dbCloseError);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => closeSystemGracefully('SIGTERM'));
process.on('SIGINT', () => closeSystemGracefully('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED PROMISE REJECTION ENCOUNTERED:', reason);
  closeSystemGracefully('UNHANDLED_REJECTION');
});
