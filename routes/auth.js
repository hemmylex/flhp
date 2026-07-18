// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit'; 
import { query } from '../db/pool.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';

const r = Router();
const DUMMY_HASH = '$2a$10$Xk7fR5Bw9ZlQyO2mN3p4qO.e7w5tY3u8v9w0x1y2z3A4B5C6D7E8F';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const bootstrapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 3, 
  message: { error: 'Request threshold exceeded for system initialization blocks.' },
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const LoginSchema = z.object({ 
  email: z.string().email().toLowerCase().trim(), 
  password: z.string().min(1) 
});

// 1. Mobile Fallback Compliant Login Route Handler
r.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input parameters' });
  }
  
  const { email, password } = parsed.data;
  const { rows } = await query(
    'SELECT id, email, full_name, role, password_hash, active FROM users WHERE email = $1', 
    [email]
  );
  
  const u = (rows && rows.length > 0) ? rows[0] : null;

  const targetHash = (u && u.active) ? u.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(password, targetHash);

  if (!u || !u.active || !ok) {
    return res.status(401).json({ error: 'Invalid email or password credentials' });
  }

  // Generate the unified signature token string
  const token = signToken(u);
  setAuthCookie(res, token);
  
  // High Priority Patch: Return token property explicitly inside JSON body for mobile storage capture
  res.json({ 
    id: u.id, 
    email: u.email, 
    fullName: u.full_name, 
    role: u.role,
    fallbackToken: token 
  });
}));

r.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// 2. Dual-Channel Session State Profile Verification Handler
r.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT id, email, full_name, role FROM users WHERE id = $1::uuid', [req.user.id]);
  
  if (!rows || rows.length === 0) {
    return res.status(401).json({ error: 'Session reference has been invalidated' });
  }
  
  const currentUser = rows[0];
  
  res.json({ 
    id: currentUser.id, 
    email: currentUser.email, 
    fullName: currentUser.full_name, 
    role: currentUser.role 
  });
}));

// 3. Fixed System Bootstrapping Endpoint with Typecasting and Fallback Tokens
r.post('/claim-first-admin', bootstrapLimiter, asyncHandler(async (req, res) => {
  const Schema = z.object({ 
    email: z.string().email().toLowerCase().trim(), 
    password: z.string().min(8), 
    fullName: z.string().min(1) 
  });
  
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid parameters' });
  }

  // Explicitly cast custom ENUM type target comparison to avoid 42804 database rejections
  const { rows: existing } = await query("SELECT 1 FROM users WHERE role = 'admin'::app_role LIMIT 1");
  if (existing && existing.length > 0) {
    return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
  }

  const hash = await bcrypt.hash(parsed.data.password, 12);
  
  try {
    // Explicitly apply custom enum ('admin'::app_role) and boolean ($4::boolean) casting rules
    const { rows } = await query(
      "INSERT INTO users (email, full_name, password_hash, role, active) VALUES ($1, $2, $3, 'admin'::app_role, $4::boolean) RETURNING id, email, full_name, role",
      [parsed.data.email, parsed.data.fullName, hash, "true"]
    );
    
    const createdAdmin = rows[0];
    const token = signToken(createdAdmin);
    setAuthCookie(res, token);
    
    // Provide explicit fallback token parameter to administrative setup threads
    res.status(201).json({ 
      id: createdAdmin.id, 
      email: createdAdmin.email, 
      fullName: createdAdmin.full_name, 
      role: createdAdmin.role,
      fallbackToken: token
    });
  } catch (dbError) {
    if (dbError.code === '23505') {
      return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
    }
    throw dbError; 
  }
}));

export default r;
