// src/routes/users.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const r = Router();
r.use(requireAuth, requireRole('admin'));

// Asynchronous route wrapper to pass unexpected failures directly down to Express global middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Structural validator scheme to securely intercept incoming dynamic path identifier targets
const IdParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid user identity parameter configuration" })
});

// 1. Fetch complete system registry index
r.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    'SELECT id, email, full_name, role, active, created_at FROM users ORDER BY created_at DESC'
  );
  // Ensure we consistently send an array matrix payload down to the frontend layout
  const formattedRows = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  res.json(formattedRows);
}));

const NewUser = z.object({
  email: z.string().email().toLowerCase().trim(), // Enhancement: Normalize formatting inputs
  fullName: z.string().min(1).trim(),
  password: z.string().min(8),
  role: z.enum(['admin', 'organizer', 'voter']),
});

// 2. Register New User Account
r.post('/', asyncHandler(async (req, res) => {
  const parsed = NewUser.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message || 'Invalid input parameters' });
  }
  
  const hash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (email, full_name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role, active, created_at',
      [parsed.data.email, parsed.data.fullName, hash, parsed.data.role]
    );
    
    // Fixed: Read straight from the root output to avoid index evaluation errors
    res.status(201).json(rows);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'This email identity profile has already been registered' });
    }
    throw e;
  }
}));

// 3. Update User Role (With Self-Demotion Lockout Block)
r.patch('/:id/role', asyncHandler(async (req, res) => {
  const paramCheck = IdParamSchema.safeParse(req.params);
  if (!paramCheck.success) {
    return res.status(400).json({ error: paramCheck.error.issues[0].message });
  }

  const parsed = z.object({ role: z.enum(['admin', 'organizer', 'voter']) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid role selection criteria parameters' });
  }

  const targetId = req.params.id;
  const currentAdminId = req.user.id;

  // Administrative Safeguard. Block an active administrator from stripping their own privileges
  if (targetId === currentAdminId && parsed.data.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Security Guard Exception: Self-demotion is restricted to prevent permanent administrative lockouts.' 
    });
  }

  // Added mandatory implicit UUID typecast marker matching standard database specifications
  const { rows } = await query(
    'UPDATE users SET role = $1 WHERE id = $2::uuid RETURNING id, role', 
    [parsed.data.role, targetId]
  );
  
  if (!rows || (Array.isArray(rows) && rows.length === 0)) {
    return res.status(404).json({ error: 'Target user account not found' });
  }
  
  res.json(rows);
}));

// 4. Toggle Account Active Status (With Self-Deactivation Lockout Block)
r.patch('/:id/active', asyncHandler(async (req, res) => {
  const paramCheck = IdParamSchema.safeParse(req.params);
  if (!paramCheck.success) {
    return res.status(400).json({ error: paramCheck.error.issues[0].message });
  }

  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid boolean toggle type input context' });
  }

  const targetId = req.params.id;
  const currentAdminId = req.user.id;

  // Administrative Safeguard. Block an active administrator from disabling themselves
  if (targetId === currentAdminId && parsed.data.active === false) {
    return res.status(403).json({ 
      error: 'Security Guard Exception: You cannot deactivate your own administrative session root profile.' 
    });
  }

  // Added mandatory implicit UUID typecast marker matching standard database specifications
  const { rows } = await query(
    'UPDATE users SET active = $1 WHERE id = $2::uuid RETURNING id, active', 
    [parsed.data.active, targetId]
  );
  
  if (!rows || (Array.isArray(rows) && rows.length === 0)) {
    return res.status(404).json({ error: 'Target user account not found' });
  }
  
  res.json(rows);
}));

export default r;
