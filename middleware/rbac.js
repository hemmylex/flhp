// src/middleware/rbac.js
import { query } from '../db/pool.js';

/**
 * Enforces dynamic Role-Based Access Control boundaries.
 * Supports individual strings, comma-separated rules, or flat arrays.
 */
export const requireRole = (...allowedRoles) => {
  // Normalize variations into a standard flat string array list
  const targets = allowedRoles.flat();

  return async (req, res, next) => {
    // 1. Session Existence Guard
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication session required.' });
    }

    try {
      // 2. Real-Time Security Guard: Added explicit UUID typecast marker matching standard database specifications
      const { rows } = await query(
        'SELECT role, active FROM users WHERE id = $1::uuid', 
        [req.user.id]
      );
      
      // Fixed: Extract the specific single row profile dictionary object from your root array context cleanly
      const liveUser = (rows && rows.length > 0) ? rows[0] : null;

      // Block access instantly if an administrator disabled the account mid-session
      if (!liveUser || !liveUser.active) {
        return res.status(401).json({ error: 'This user account has been deactivated or removed.' });
      }

      // Synchronize the request context user profile metadata with real-time database state variables
      req.user.role = liveUser.role;

      // 3. Strict Deterministic Access Verification (Eliminated loose numerical hierarchy overrides)
      const hasAccess = targets.includes(req.user.role);

      if (!hasAccess) {
        return res.status(403).json({ 
          error: `Access Denied: Your profile role authorization tier (${req.user.role}) cannot execute this operation.` 
        });
      }

      // Authorization passed successfully, forward request down the pipeline
      next();

    } catch (error) {
      console.error('RBAC Authorization verification engine fault:', error);
      // Pass the execution failure down to your global Express centralized error interceptor middleware
      next(error);
    }
  };
};
