import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const r = Router();
r.use(requireAuth);

// Asynchronous route wrapper to pass unexpected failures directly down to Express global middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 1. Enhanced Master Index: Flattened subqueries into high-speed relational joins
r.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT 
      e.id, 
      e.title, 
      e.description, 
      e.starts_at, 
      e.ends_at, 
      e.created_by,
      COALESCE(COUNT(DISTINCT c.id), 0)::int AS candidate_count,
      COALESCE(COUNT(DISTINCT v.id), 0)::int AS vote_count
    FROM elections e
    LEFT JOIN candidates c ON c.election_id = e.id
    LEFT JOIN votes v ON v.election_id = e.id
    GROUP BY e.id
    ORDER BY e.starts_at DESC
  `);
  res.json(rows);
}));

r.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM elections WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Election record not found' });
  res.json(rows[0]);
}));

// 2. Enhanced Schema: Enforce logical date-time boundaries using custom validation refinements
const NewElection = z.object({
  title: z.string().min(1).trim(),
  description: z.string().optional().nullable(),
  startsAt: z.string().datetime(), // Enforce valid ISO string patterns
  endsAt: z.string().datetime(),
}).refine(data => new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(), {
  message: "The election conclusion timestamp must be scheduled after the opening start date",
  path: ["endsAt"]
});

r.post('/', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const parsed = NewElection.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  
  const { title, description, startsAt, endsAt } = parsed.data;
  const { rows } = await query(
    'INSERT INTO elections (title, description, starts_at, ends_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [title, description ?? null, startsAt, endsAt, req.user.id]
  );
  res.status(201).json(rows[0]);
}));

// 3. Robust Delete Guard: Wrapped data purge routines into isolated transactions
r.delete('/:id', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const check = await query('SELECT 1 FROM elections WHERE id = $1', [id]);
  if (check.rowCount === 0) {
    return res.status(404).json({ error: 'Election profile not found' });
  }

  await query('BEGIN');
  try {
    // Manually clean up relational associations sequentially to prevent constraint faults
    await query('DELETE FROM votes WHERE election_id = $1', [id]);
    await query('DELETE FROM candidates WHERE election_id = $1', [id]);
    await query('DELETE FROM elections WHERE id = $1', [id]);
    
    await query('COMMIT');
    res.json({ ok: true, message: "Election cluster safely purged from systems" });
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}));

// Candidates nested under election
r.get('/:id/candidates', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const check = await query('SELECT 1 FROM elections WHERE id = $1', [id]);
  if (check.rowCount === 0) {
    return res.status(404).json({ error: 'Election wrapper does not exist' });
  }

  const { rows } = await query('SELECT * FROM candidates WHERE election_id = $1 ORDER BY created_at', [id]);
  res.json(rows);
}));

const NewCandidate = z.object({
  fullName: z.string().min(1).trim(),
  party: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().url().or(z.string().length(0)).optional().nullable(), // Allow empty path fallback values
  photoPublicId: z.string().optional().nullable(),
});

r.post('/:id/candidates', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Guard clause: Ensure target election context exists before pushing child candidacies
  const electionCheck = await query('SELECT starts_at FROM elections WHERE id = $1', [id]);
  if (electionCheck.rowCount === 0) {
    return res.status(404).json({ error: 'Cannot append candidates to a missing election' });
  }

  const parsed = NewCandidate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  
  const { fullName, party, bio, photoUrl, photoPublicId } = parsed.data;
  const { rows } = await query(
    'INSERT INTO candidates (election_id, full_name, party, bio, photo_url, photo_public_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, fullName, party ?? null, bio ?? null, photoUrl || null, photoPublicId ?? null]
  );
  res.status(201).json(rows[0]);
}));



// Enhanced Secure Vote Casting (Defended Against Multi-Election Tampering)
r.post('/:id/vote', requireRole('voter'), asyncHandler(async (req, res) => {
  const parsed = z.object({ candidateId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload input structure' });
  }
  
  const electionId = req.params.id;
  const voterId = req.user.id;
  const { candidateId } = parsed.data;

  // Open an explicit atomic isolation database transaction block
  await query('BEGIN');
  
  try {
    // A. Verify target election context presence alongside time bounds validation
    const { rows: erows } = await query(
      'SELECT starts_at, ends_at FROM elections WHERE id = $1 FOR SHARE', 
      [electionId]
    );
    const e = erows[0];
    if (!e) {
      await query('ROLLBACK');
      return res.status(404).json({ error: 'Target election registry instance not found' });
    }

    const now = new Date();
    if (now < new Date(e.starts_at)) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'The voting window for this election has not opened yet' });
    }
    if (now > new Date(e.ends_at)) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'The voting window for this election has officially closed' });
    }

    // B. Critical Security Enhancement: Ensure candidate actually belongs to this specific election
    const { rows: crows } = await query(
      'SELECT 1 FROM candidates WHERE id = $1 AND election_id = $2',
      [candidateId, electionId]
    );
    if (crows.length === 0) {
      await query('ROLLBACK');
      return res.status(400).json({ error: 'Security Exception: Candidate selection does not exist inside this ballot' });
    }

    // C. Concurrency Guard: Explicit transactional verify to check if voter has already cast a ballot
    const { rows: vrows } = await query(
      'SELECT 1 FROM votes WHERE election_id = $1 AND voter_id = $2 FOR UPDATE',
      [electionId, voterId]
    );
    if (vrows.length > 0) {
      await query('ROLLBACK');
      return res.status(409).json({ error: 'You have already recorded a vote within this election' });
    }

    // D. Safe record insert operations execution
    const { rows } = await query(
      'INSERT INTO votes (election_id, candidate_id, voter_id) VALUES ($1,$2,$3) RETURNING id, created_at',
      [electionId, candidateId, voterId]
    );
    
    await query('COMMIT');
    res.status(201).json({ ok: true, ballotReceipt: rows[0].id });

  } catch (err) {
    await query('ROLLBACK');
    // Fallback handler for unique table constraint index collision definitions
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already recorded a vote within this election' });
    }
    throw err; // Bubbles up to global Express logger
  }
}));

// Enhanced High-Speed Real-Time Live Results Engine
r.get('/:id/results', asyncHandler(async (req, res) => {
  const electionId = req.params.id;

  // Verify that the election exists first to avoid returning empty matrices for wrong URLs
  const electionCheck = await query('SELECT title FROM elections WHERE id = $1', [electionId]);
  if (electionCheck.rowCount === 0) {
    return res.status(404).json({ error: 'Target election parameters not found' });
  }

  // Left-join aggregate compilation mapping out direct counts per candidate instance
  const { rows } = await query(`
    SELECT 
      c.id, 
      c.full_name, 
      c.party, 
      c.photo_url,
      COALESCE(COUNT(v.id), 0)::int AS votes
    FROM candidates c
    LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = $1
    WHERE c.election_id = $1
    GROUP BY c.id 
    ORDER BY votes DESC`, 
    [electionId]
  );

  const total = rows.reduce((acc, row) => acc + row.votes, 0);
  
  // Format percentage distributions smoothly for charts
  const candidatesWithMetrics = rows.map(r => ({
    id: r.id,
    full_name: r.full_name,
    party: r.party,
    photo_url: r.photo_url,
    votes: r.votes,
    pct: total > 0 ? Number(((r.votes / total) * 100).toFixed(4)) : 0 // Upgraded decimal accuracy
  }));

  res.json({ 
    electionTitle: electionCheck.rows[0].title,
    total, 
    candidates: candidatesWithMetrics 
  });
}));

export default r;
