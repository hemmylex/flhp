import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const r = Router();
r.use(requireAuth);

// Asynchronous error forwarder to safely bubble unhandled SQL faults up to Express boundaries
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Enhanced Delete Endpoint featuring Transaction Protection & Asset Synchronization
r.delete('/:id', requireRole('admin', 'organizer'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Fetch the candidate profile to check for asset IDs before modifying any tables
  const checkRes = await query('SELECT photo_public_id, election_id FROM candidates WHERE id = $1', [id]);
  if (checkRes.rowCount === 0) {
    return res.status(404).json({ error: 'Candidate profile record not found' });
  }

  const { photo_public_id: publicId, election_id: electionId } = checkRes.rows[0];

  // 2. Business Logic Rule: Enforce data locking to block modifications if the voting cycle is active
  const electionCheck = await query('SELECT starts_at, ends_at FROM elections WHERE id = $1', [electionId]);
  if (electionCheck.rowCount > 0) {
    const now = Date.now();
    const start = new Date(electionCheck.rows[0].starts_at).getTime();
    const end = new Date(electionCheck.rows[0].ends_at).getTime();
    
    if (now >= start && now <= end) {
      return res.status(400).json({ error: 'Cannot remove candidates while the election ballot cycle is live.' });
    }
  }

  // 3. Open an explicit database transaction block to ensure cascade reliability
  await query('BEGIN');
  
  try {
    // Cascade cleanup: Safely eliminate ballot links mapped to this specific user ID row first
    await query('DELETE FROM votes WHERE candidate_id = $1', [id]);
    
    // Purge primary user candidate record matching targeting criteria parameters
    await query('DELETE FROM candidates WHERE id = $1', [id]);

    // 4. Fire asset destruction to Cloudinary ONLY after table rows successfully lock out
    if (publicId) {
      const cloudRes = await cloudinary.uploader.destroy(publicId);
      
      // Explicitly catch account failures or incorrect keys returned from the cloud asset platform
      if (cloudRes.result !== 'ok' && cloudRes.result !== 'not_found') {
        throw new Error(`Cloudinary asset deletion returned unverified response status: ${cloudRes.result}`);
      }
    }

    // Commit changes safely to the storage engine
    await query('COMMIT');
    res.json({ ok: true, message: 'Candidate and dependent data records successfully purged.' });

  } catch (executionError) {
    // Instantly roll back our database transaction timeline to safe states if anything fails
    await query('ROLLBACK');
    console.error('Candidate deletion fallback execution error log stack:', executionError);
    
    return res.status(500).json({ 
      error: 'Failed to purge candidate metrics. Asset pipeline operations rolled back safely to prevent data anomalies.' 
    });
  }
}));

export default r;
