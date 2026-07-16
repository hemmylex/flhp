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
  const { rows } = await query(
    'SELECT id, title, body, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(rows);
}));

// 2. Enhanced Single Read Marker featuring Param Guard and row checks
r.post('/:id/read', asyncHandler(async (req, res) => {
  const parsed = ParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { id } = parsed.data;
  const userId = req.user.id;

  const result = await query(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', 
    [id, userId]
  );

  // Enhancement: Verify that a row was actually updated before returning a success payload
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Notification item not found or already marked as read' });
  }

  res.json({ ok: true, markedId: id });
}));

// 3. Global Read-All Mutation
r.post('/read-all', asyncHandler(async (req, res) => {
  const result = await query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', 
    [req.user.id]
  );
  
  res.json({ 
    ok: true, 
    message: `Successfully synchronized ${result.rowCount} unread items in your feed container.` 
  });
}));

export default r;
