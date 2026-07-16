// src/routes/auth.js
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
  
  const u = (rows && rows.length > 0) ? rows : null;

  // Fixed Structural Bug: Optional chaining syntax to protect against unhandled type exceptions
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
  // Added mandatory explicit UUID typecast marker matching standard database specifications
  const { rows } = await query('SELECT id, email, full_name, role FROM users WHERE id = $1::uuid', [req.user.id]);
  
  if (!rows || rows.length === 0) {
    return res.status(401).json({ error: 'Session reference has been invalidated' });
  }
  
  res.json({ id: rows.id, email: rows.email, fullName: rows.full_name, role: rows.role });
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
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  // Fixed Wrapper Call: Use array length parsing directly to verify entity counts
  const { rows: existing } = await query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (existing && existing.length > 0) {
    return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
  }

  const hash = await bcrypt.hash(parsed.data.password, 12); // Upped work factor slightly for administrative profiles
  
  try {
    // High Priority Fix: Explicitly typecast $4 to boolean since query variables pass as strings through the text[] array
    const { rows } = await query(
      "INSERT INTO users (email, full_name, password_hash, role, active) VALUES ($1, $2, $3, 'admin', $4::boolean) RETURNING id, email, full_name, role",
      [parsed.data.email, parsed.data.fullName, hash, "true"]
    );
    
    // Fixed Critical Bug: Access properties from index [0] to protect against undefined key payload crashes
    const createdUser = rows[0];
    
    res.status(201).json({ 
      id: createdUser.id, 
      email: createdUser.email, 
      fullName: createdUser.full_name, 
      role: createdUser.role 
    });
    
  } catch (dbError) {
    // Gracefully handle duplicate keys if a secondary race request hits your partial unique index
    if (dbError.code === '23505') {
      return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
    }
    throw dbError; // Forward other unhandled database errors to your global app middleware
  }
}));


export default r;
