// src/routes/elections.js
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

// 1. Enhanced Master Index: Bypassed massive Cartesian products using high-speed relational subqueries
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

r.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM elections WHERE id = $1::uuid', [req.params.id]);
  if (!rows || !rows[0]) return res.status(404).json({ error: 'Election record not found' });
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
    'INSERT INTO elections (title, description, starts_at, ends_at, created_by) VALUES ($1, $2, $3::timestamp, $4::timestamp, $5::uuid) RETURNING *',
    [title, description ?? null, startsAt, endsAt, req.user.id]
  );
  res.status(201).json(rows[0]);
}));

// 3. Robust Delete Guard: Wrapped data purge routines into an atomic multi-table execution block 
r.delete('/:id', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Single-statement atomic layout using CTEs to ensure structural isolation over REST
  const { rows } = await query(`
    WITH target_election AS (
      SELECT id FROM elections WHERE id = $1::uuid
    ),
    del_votes AS (
      DELETE FROM votes WHERE election_id IN (SELECT id FROM target_election)
    ),
    del_candidates AS (
      DELETE FROM candidates WHERE election_id IN (SELECT id FROM target_election)
    )
    DELETE FROM elections WHERE id IN (SELECT id FROM target_election) RETURNING id;
  `, [id]);

  if (!rows || rows.length === 0) {
    return res.status(404).json({ error: 'Election profile not found or already deleted' });
  }

  res.json({ ok: true, message: "Election cluster safely purged from systems" });
}));

// Candidates nested under election
r.get('/:id/candidates', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const check = await query('SELECT 1 FROM elections WHERE id = $1::uuid', [id]);
  if (!check || check.rowCount === 0) {
    return res.status(404).json({ error: 'Election wrapper does not exist' });
  }

  const { rows } = await query('SELECT * FROM candidates WHERE election_id = $1::uuid ORDER BY created_at', [id]);
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
  const electionCheck = await query('SELECT starts_at FROM elections WHERE id = $1::uuid', [id]);
  if (!electionCheck || electionCheck.rowCount === 0) {
    return res.status(404).json({ error: 'Cannot append candidates to a missing election' });
  }

  const parsed = NewCandidate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  
  const { fullName, party, bio, photoUrl, photoPublicId } = parsed.data;
  const { rows } = await query(
    'INSERT INTO candidates (election_id, full_name, party, bio, photo_url, photo_public_id) VALUES ($1::uuid, $2, $3, $4, $5, $6) RETURNING *',
    [id, fullName, party ?? null, bio ?? null, photoUrl || null, photoPublicId ?? null]
  );
  res.status(201).json(rows[0]);
}));

// Enhanced Secure Vote Casting (Defended Against Multi-Election Tampering and Stateless RPC constraints)
r.post('/:id/vote', requireRole('voter'), asyncHandler(async (req, res) => {
  const parsed = z.object({
    candidateId: z.string().uuid()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload input structure'
    });
  }

  const electionId = req.params.id;
  const voterId = req.user.id;
  const { candidateId } = parsed.data;

  await query('BEGIN');

  try {
    // Validate election, voter and candidate
    const { rows } = await query(
      `
      SELECT
        e.starts_at,
        e.ends_at,
        u.active,
        EXISTS (
          SELECT 1
          FROM candidates c
          WHERE c.id = $1::uuid
            AND c.election_id = $2::uuid
        ) AS valid_candidate
      FROM elections e
      JOIN users u
        ON u.id = $3::uuid
      WHERE e.id = $2::uuid
      `,
      [candidateId, electionId, voterId]
    );

    if (rows.length === 0) {
      await query('ROLLBACK');
      return res.status(404).json({
        error: 'Election not found'
      });
    }

    const ctx = rows[0];
    const now = new Date();

    if (!ctx.active) {
      await query('ROLLBACK');
      return res.status(403).json({
        error: 'Your account is inactive.'
      });
    }

    if (now < new Date(ctx.starts_at)) {
      await query('ROLLBACK');
      return res.status(400).json({
        error: 'Voting has not started yet.'
      });
    }

    if (now > new Date(ctx.ends_at)) {
      await query('ROLLBACK');
      return res.status(400).json({
        error: 'Voting has ended.'
      });
    }

    if (!ctx.valid_candidate) {
      await query('ROLLBACK');
      return res.status(400).json({
        error: 'Invalid candidate for this election.'
      });
    }

    const vote = await query(
      `
      INSERT INTO votes (
        election_id,
        candidate_id,
        voter_id,
        ip_address,
        user_agent
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5
      )
      RETURNING id, created_at
      `,
      [
        electionId,
        candidateId,
        voterId,
        req.ip,
        req.get('user-agent')
      ]
    );

    await query('COMMIT');

    return res.status(201).json({
      ok: true,
      receiptId: vote.rows[0].id,
      votedAt: vote.rows[0].created_at
    });

  } catch (err) {
    await query('ROLLBACK');

    // Duplicate vote blocked by UNIQUE(election_id, voter_id)
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'You have already voted in this election.'
      });
    }

    throw err;
  }
}));

// GET /elections/:id/my-vote

r.get(
  '/:id/my-vote',
  requireRole('voter'),
  asyncHandler(async (req, res) => {
    const electionId = req.params.id;
    const voterId = req.user.id;

    const { rows } = await query(
      `
      SELECT
        v.id,
        v.candidate_id,
        v.created_at,
        c.full_name AS candidate_name,
        c.party,
        c.photo_url
      FROM votes v
      JOIN candidates c
        ON c.id = v.candidate_id
      WHERE
        v.election_id = $1::uuid
        AND v.voter_id = $2::uuid
      LIMIT 1
      `,
      [electionId, voterId]
    );

    if (rows.length === 0) {
      return res.json({
        voted: false
      });
    }

    return res.json({
      voted: true,
      vote: rows[0]
    });
  })
);

// Enhanced High-Speed Real-Time Live Results Engine
r.get('/:id/results', asyncHandler(async (req, res) => {
  const electionId = req.params.id;

  // Verify that the election exists first to avoid returning empty matrices for wrong URLs
  const electionCheck = await query('SELECT title FROM elections WHERE id = $1::uuid', [electionId]);
  if (!electionCheck || electionCheck.rowCount === 0) {
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
    LEFT JOIN votes v ON v.candidate_id = c.id AND v.election_id = $1::uuid
    WHERE c.election_id = $1::uuid
    GROUP BY c.id 
    ORDER BY votes DESC`, 
    [electionId]
  );

  const total = rows.reduce((acc, row) => acc + Number(row.votes || 0), 0);
  
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

