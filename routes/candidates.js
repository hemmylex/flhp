// src/routes/candidates.js
import { Router } from 'express';
import { query, supabase } from '../db/pool.js'; // Imports your unified SDK client definitions
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const r = Router();
r.use(requireAuth);

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Enhanced Delete Endpoint featuring Atomic Cascade Protection & Supabase Storage Asset Sync
r.delete('/:id', requireRole('admin', 'organizer'), asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // 1. Fetch the candidate profile using your destructured root object rows parameter layout
  const { rows: candidateRows } = await query('SELECT photo_public_id, election_id FROM candidates WHERE id = $1::uuid', [id]);
  
  if (!candidateRows || candidateRows.length === 0) {
    return res.status(404).json({ error: 'Candidate profile record not found' });
  }

  const { photo_public_id: publicId, election_id: electionId } = candidateRows;

  // 2. Business Logic Rule: Enforce data locking to block modifications if the voting cycle is active
  const { rows: electionRows } = await query('SELECT starts_at, ends_at FROM elections WHERE id = $1::uuid', [electionId]);
  
  if (electionRows && electionRows.length > 0) {
    const now = Date.now();
    const start = new Date(electionRows.starts_at).getTime();
    const end = new Date(electionRows.ends_at).getTime();
    
    if (now >= start && now <= end) {
      return res.status(400).json({ error: 'Cannot remove candidates while the election ballot cycle is live.' });
    }
  }

  try {
    // 3. Cloud Asset Cleanup: Remove the file from the storage bucket before applying permanent database purges
    if (publicId) {
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'candidate-photos';
      
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([publicId]);

      if (storageError) {
        const customStorageError = new Error(`Supabase Storage removal fault: ${storageError.message}`);
        customStorageError.status = 424; // Failed Dependency status code
        throw customStorageError;
      }
    }

    // 4. Fixed Transaction Workaround: Execute cascading deletions using an atomic single-statement CTE 
    const { rows: purgeRows } = await query(`
      WITH target_candidate AS (
        SELECT id FROM candidates WHERE id = $1::uuid
      ),
      del_votes AS (
        DELETE FROM votes WHERE candidate_id IN (SELECT id FROM target_candidate)
      )
      DELETE FROM candidates WHERE id IN (SELECT id FROM target_candidate) RETURNING id;
    `, [id]);

    if (!purgeRows || purgeRows.length === 0) {
      return res.status(404).json({ error: 'Candidate profile could not be removed or was already deleted.' });
    }

    res.json({ ok: true, message: 'Candidate and dependent data records successfully purged.' });

  } catch (executionError) {
    // Forward the actual system log down into the centralized Express global fault handler
    next(executionError);
  }
}));

export default r;
