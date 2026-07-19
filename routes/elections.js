// src/routes/elections.js
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const r = Router();

r.use(requireAuth);

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* ====================== ELECTIONS ====================== */

// List all elections
r.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT
      e.id,
      e.title,
      e.description,
      e.starts_at,
      e.ends_at,
      e.created_by,
      (SELECT COALESCE(COUNT(*), 0)::int FROM candidates c WHERE c.election_id = e.id) AS candidate_count,
      (SELECT COALESCE(COUNT(*), 0)::int FROM votes v WHERE v.election_id = e.id) AS vote_count
    FROM elections e
    ORDER BY e.starts_at DESC
  `);
  res.json(rows);
}));

// Get single election
r.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM elections WHERE id = $1::uuid', [req.params.id]);
  if (!rows?.length) return res.status(404).json({ error: 'Election record not found' });
  res.json(rows[0]);
}));

// Create new election
const NewElection = z.object({
  title: z.string().min(1).trim(),
  description: z.string().optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
  message: "End time must be after start time",
  path: ["endsAt"],
});

r.post('/', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const parsed = NewElection.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message });
  }

  const { title, description, startsAt, endsAt } = parsed.data;

  const { rows } = await query(
    `INSERT INTO elections (title, description, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3::timestamp, $4::timestamp, $5::uuid) RETURNING *`,
    [title, description ?? null, startsAt, endsAt, req.user.id]
  );

  res.status(201).json(rows[0]);
}));

// Delete election + related data
r.delete('/:id', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { rows } = await query(`
    WITH target AS (
      SELECT id FROM elections WHERE id = $1::uuid
    ),
    del_votes AS (DELETE FROM votes WHERE election_id IN (SELECT id FROM target)),
    del_candidates AS (DELETE FROM candidates WHERE election_id IN (SELECT id FROM target))
    DELETE FROM elections WHERE id IN (SELECT id FROM target) RETURNING id;
  `, [id]);

  if (!rows?.length) return res.status(404).json({ error: 'Election not found' });

  res.json({ ok: true, message: 'Election and related data deleted successfully' });
}));

/* ====================== CANDIDATES ====================== */

// Get candidates for election
r.get('/:id/candidates', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const exists = await query('SELECT 1 FROM elections WHERE id = $1::uuid', [id]);
  if (!exists?.rowCount) return res.status(404).json({ error: 'Election not found' });

  const { rows } = await query(
    'SELECT * FROM candidates WHERE election_id = $1::uuid ORDER BY full_name ASC',
    [id]
  );
  res.json(rows);
}));

const NewCandidate = z.object({
  fullName: z.string().min(1).trim(),
  party: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  photoUrl: z.string().url().or(z.literal('')).optional().nullable(),
  photoPublicId: z.string().optional().nullable(),
});

r.post('/:id/candidates', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const electionExists = await query('SELECT 1 FROM elections WHERE id = $1::uuid', [id]);
  if (!electionExists?.rowCount) return res.status(404).json({ error: 'Election not found' });

  const parsed = NewCandidate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const { fullName, party, bio, photoUrl, photoPublicId } = parsed.data;

  const { rows } = await query(
    `INSERT INTO candidates (election_id, full_name, party, bio, photo_url, photo_public_id)
     VALUES ($1::uuid, $2, $3, $4, $5, $6) RETURNING *`,
    [id, fullName, party ?? null, bio ?? null, photoUrl || null, photoPublicId ?? null]
  );

  res.status(201).json(rows[0]);
}));

/* ====================== VOTING ====================== */

// Cast vote
r.post('/:id/vote', requireRole('voter'), asyncHandler(async (req, res) => {
  const parsed = z.object({ candidateId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid candidateId' });

  const { candidateId } = parsed.data;
  const electionId = req.params.id;
  const voterId = req.user.id;

  const { rows } = await query(
    `
    SELECT
      e.starts_at,
      e.ends_at,
      u.active,
      EXISTS (SELECT 1 FROM candidates c WHERE c.id = $1::uuid AND c.election_id = $2::uuid) AS valid_candidate
    FROM elections e
    JOIN users u ON u.id = $3::uuid
    WHERE e.id = $2::uuid
    `,
    [candidateId, electionId, voterId]
  );

  if (!rows.length) return res.status(404).json({ error: 'Election not found' });

  const ctx = rows[0];
  const now = new Date();

  if (!ctx.active) return res.status(403).json({ error: 'Your account is inactive' });
  if (now < new Date(ctx.starts_at)) return res.status(400).json({ error: 'Voting has not started yet' });
  if (now > new Date(ctx.ends_at)) return res.status(400).json({ error: 'Voting has ended' });
  if (!ctx.valid_candidate) return res.status(400).json({ error: 'Invalid candidate' });

  try {
    const result = await query(
      `
      INSERT INTO votes (election_id, candidate_id, voter_id, ip_address, user_agent)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
      RETURNING id, created_at
      `,
      [electionId, candidateId, voterId, req.ip, req.get('user-agent')]
    );

    return res.status(201).json({
      ok: true,
      receiptId: result.rows[0].id,
      votedAt: result.rows[0].created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already voted in this election.' });
    }
    throw err;
  }
}));

// Get current user's vote (CRITICAL FIX)
r.get('/:id/my-vote', requireRole('voter'), asyncHandler(async (req, res) => {
  const electionId = req.params.id;
  const voterId = req.user.id;

  const { rows } = await query(
    `
    SELECT v.id, v.candidate_id, v.created_at
    FROM votes v
    WHERE v.election_id = $1::uuid AND v.voter_id = $2::uuid
    LIMIT 1
    `,
    [electionId, voterId]
  );

  // Return null when no vote (matches frontend)
  if (!rows.length) return res.json(null);

  res.json(rows[0]);
}));

/* ====================== RESULTS ====================== */

r.get('/:id/results', asyncHandler(async (req, res) => {
  const electionId = req.params.id;

  const electionCheck = await query('SELECT title FROM elections WHERE id = $1::uuid', [electionId]);
  if (!electionCheck?.rowCount) return res.status(404).json({ error: 'Election not found' });

  const { rows } = await query(
    `
    SELECT
      c.id,
      c.full_name,
      c.party,
      c.photo_url,
      COALESCE(COUNT(v.id), 0)::int AS votes
    FROM candidates c
    LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = $1::uuid
    WHERE c.election_id = $1::uuid
    GROUP BY c.id
    ORDER BY votes DESC
    `,
    [electionId]
  );

  const total = rows.reduce((sum, r) => sum + Number(r.votes || 0), 0);

  const candidatesWithMetrics = rows.map(r => ({
    id: r.id,
    full_name: r.full_name,
    party: r.party,
    photo_url: r.photo_url,
    votes: r.votes,
    pct: total > 0 ? Number(((r.votes / total) * 100).toFixed(2)) : 0,
  }));

  res.json({
    electionTitle: electionCheck.rows[0].title,
    total,
    candidates: candidatesWithMetrics,
  });
}));

export default r;
