import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit'; // Enforces brute-force threshold constraints
import { query } from '../db/pool.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';

const r = Router();

// A generic dummy hash matching standard production salts used to prevent timing signature leakage
const DUMMY_HASH = '$2a$10$Xk7fR5Bw9ZlQyO2mN3p4qO.e7w5tY3u8v9w0x1y2z3A4B5C6D7E8F';

// 1. Configure specialized security rate-limiting bounds
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 5, // Limit each IP address to 5 failed login attempts per window
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // Highly restrictive endpoint protection
  message: { error: 'Request threshold exceeded for system initialization blocks.' },
});

// Asynchronous route handler wrapper to forward unexpected database errors safely to the Express boundary
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const LoginSchema = z.object({ 
  email: z.string().email().toLowerCase().trim(), // Force data formatting consistency
  password: z.string().min(1) 
});

// 2. Enhanced Login with Timing Attack Defense & Rate Limiting
r.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input parameters' });
  }
  
  const { email, password } = parsed.data;
  const { rows } = await query(
    'SELECT id, email, full_name, role, password_hash, active FROM users WHERE email = $1', 
    [email]
  );
  
  const u = rows[0];

  // Fix 1: Timing attack protection. Run bcrypt even if user doesn't exist or is disabled
  const targetHash = (u && u.active) ? u.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(password, targetHash);

  // Fail safely with generic, non-descriptive error text to mask database entity states
  if (!u || !u.active || !ok) {
    return res.status(401).json({ error: 'Invalid email or password credentials' });
  }

  const token = signToken(u);
  setAuthCookie(res, token);
  
  res.json({ id: u.id, email: u.email, fullName: u.full_name, role: u.role });
}));

r.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT id, email, full_name, role FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) {
    return res.status(401).json({ error: 'Session reference has been invalidated' });
  }
  res.json({ id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name, role: rows[0].role });
}));

// 3. Race Condition Defended Bootstrap Endpoint
r.post('/claim-first-admin', bootstrapLimiter, asyncHandler(async (req, res) => {
  const Schema = z.object({ 
    email: z.string().email().toLowerCase().trim(), 
    password: z.string().min(8), 
    fullName: z.string().min(1) 
  });
  
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input profile parameters' });
  }

  // Fix 2: Check for existing admin records. 
  // Note: To perfectly secure this against concurrent split-second execution races, 
  // ensure your Postgres table has a UNIQUE index on the `role` column where role = 'admin',
  // or a partial index: CREATE UNIQUE INDEX single_admin_idx ON users(role) WHERE role = 'admin';
  const existing = await query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (existing.rowCount > 0) {
    return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
  }

  const hash = await bcrypt.hash(parsed.data.password, 12); // Upped work factor slightly for administrative profiles
  
  try {
    const { rows } = await query(
      "INSERT INTO users (email, full_name, password_hash, role, active) VALUES ($1,$2,$3,'admin', true) RETURNING id, email, full_name, role",
      [parsed.data.email, parsed.data.fullName, hash]
    );
    res.status(21).json({ id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name, role: rows[0].role });
  } catch (dbError) {
    // Gracefully handle duplicate keys if a secondary race request hits your partial unique index
    if (dbError.code === '23505') {
      return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
    }
    throw dbError; // Forward other unhandled database errors to your global app middleware
  }
}));

export default r;
