// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit'; 
import { query } from '../db/pool.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../middleware/auth.js';

const r = Router();
const DUMMY_HASH = '$2a$10$Xk7fR5Bw9ZlQyO2mN3p4qO.e7w5tY3u8v9w0x1y2z3A4B5C6D7E8F';

const allowedRoles = ['admin', 'voter', 'organizer'];

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

// 1. Login Route
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
  
  const u = rows?.[0] || null;
  const targetHash = (u && u.active) ? u.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(password, targetHash);

  if (!u || !u.active || !ok) {
    return res.status(401).json({ error: 'Invalid email or password credentials' });
  }

  const token = signToken(u);
  setAuthCookie(res, token);
  
  res.json({ 
    id: u.id, 
    email: u.email, 
    fullName: u.full_name, 
    role: u.role,
    fallbackToken: token 
  });
}));

// 2. Logout Route
r.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// 3. Session Verification
r.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, email, full_name, role FROM users WHERE id = $1::uuid',
    [req.user.id]
  );
  
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

// 4. First Admin Bootstrapping
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

  // Check if an admin already exists
  const { rows: existing } = await query(
    "SELECT 1 FROM users WHERE role = 'admin'::app_role LIMIT 1"
  );
  if (existing && existing.length > 0) {
    return res.status(403).json({ error: 'Initial administrator bootstrapping has already concluded' });
  }

  const hash = await bcrypt.hash(parsed.data.password, 12);
  
  try {
    const { rows } = await query(
      `INSERT INTO users (id, email, full_name, password_hash, role, active, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'admin'::app_role, $4::boolean, now())
       RETURNING id, email, full_name, role, active, created_at`,
      [parsed.data.email, parsed.data.fullName, hash, true]
    );
    
    const createdAdmin = rows[0];
    const token = signToken(createdAdmin);
    setAuthCookie(res, token);
    
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

// 5. General User Creation
r.post('/users', asyncHandler(async (req, res) => {
  const Schema = z.object({
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(8),
    fullName: z.string().min(1),
    role: z.enum(['admin','voter','organizer'])
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid parameters' });

  const { email, password, fullName, role } = parsed.data;
  const hash = await bcrypt.hash(password, 12);

  const { rows } = await query(
    `INSERT INTO users (id, email, full_name, password_hash, role, active, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::app_role, true, now())
     RETURNING id, email, full_name, role, active, created_at`,
    [email, fullName, hash, role]
  );

  res.status(201).json(rows[0]);
}));

// 6. List Users
r.get('/users', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, email, full_name, role, active, created_at FROM users ORDER BY created_at DESC'
  );
  res.json(rows);
}));

// 7. Update Role
r.patch('/users/:id/role', asyncHandler(async (req, res) => {
  const Schema = z.object({ role: z.enum(['admin','voter','organizer']) });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role' });

  const { role } = parsed.data;
  const { rows } = await query(
    `UPDATE users SET role = $2::app_role WHERE id = $1::uuid RETURNING id, email, full_name, role, active`,
    [req.params.id, role]
  );

  if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

// 8. Toggle Active
r.patch('/users/:id/active', asyncHandler(async (req, res) => {
  const Schema = z.object({ active: z.boolean() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid active flag' });

  const { active } = parsed.data;
  const { rows } = await query(
    `UPDATE users SET active = $2::boolean WHERE id = $1::uuid RETURNING id, email, full_name, role, active`,
    [req.params.id, active]
  );

  if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

export default r;
