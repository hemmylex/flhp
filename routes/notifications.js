// src/routes/notifications.js
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

// Asynchronous error forwarder to safely bubble unhandled SQL faults up to Express boundaries
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Param validation scheme to safely intercept structural UUID data inputs
const ParamSchema = z.object({
  id: z.string().uuid({ message: "Invalid notification identity parameter structure" })
});

// 1. Fetch Notification Feed capped at top 50 matches
r.get('/', asyncHandler(async (req, res) => {
  const voterId = req.user.id;
  const { rows } = await query(
    'SELECT id, title, body, read_at, created_at FROM notifications WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 50',
    [voterId]
  );
  
  // Format response parameters to mimic your refactored database array expectations uniformly
  const formattedRows = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  res.json(formattedRows);
}));

// Fix 1: Global Read-All Mutation (Moved ABOVE the dynamic parameter route to fix Express router execution collisions)
r.post('/read-all', asyncHandler(async (req, res) => {
  const voterId = req.user.id;

  // Fix 2 & 3: Added RETURNING clause to dynamically track metrics across stateless RPCs
  const { rows } = await query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = $1::uuid AND read_at IS NULL RETURNING id', 
    [voterId]
  );
  
  const updatedCount = Array.isArray(rows) ? rows.length : (rows ? 1 : 0);

  res.json({ 
    ok: true, 
    message: `Successfully synchronized ${updatedCount} unread items in your feed container.` 
  });
}));

// 2. Enhanced Single Read Marker featuring Param Guard, explicit UUID typecasting, and row checks
r.post('/:id/read', asyncHandler(async (req, res) => {
  const parsed = ParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { id } = parsed.data;
  const userId = req.user.id;

  // Fix 2 & 3: Injected explicit trailing ::uuid casting adjustments alongside a RETURNING data anchor
  const { rows } = await query(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1::uuid AND user_id = $2::uuid AND read_at IS NULL RETURNING id', 
    [id, userId]
  );

  // Enhancement: Verify that a row was actually updated by assessing the array length bounds cleanly
  if (!rows || (Array.isArray(rows) && rows.length === 0)) {
    return res.status(404).json({ error: 'Notification item not found or already marked as read' });
  }

  res.json({ ok: true, markedId: id });
}));

export default r;
