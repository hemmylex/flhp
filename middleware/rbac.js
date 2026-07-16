// src/middleware/rbac.js
import { query } from '../db/pool.js';

// Define the natural role-tier authority inheritance scale for the platform
const ROLE_HIERARCHY = {
  voter: 1,
  organizer: 2,
  admin: 3
};

/**
 * Enforces dynamic Role-Based Access Control boundaries.
 * Supports individual strings, comma-separated rules, or flat arrays.
 * Example Usage: 
 *   requireRole('admin')
 *   requireRole(['admin', 'organizer'])
 */
export const requireRole = (...allowedRoles) => {
  // Normalize variations into a standard flat string array list
  const targets = allowedRoles.flat();

  return async (req, res, next) => {
    // 1. Session Existence Guard
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication session required' });
    }

    try {
      // 2. Real-Time Security Guard: Fetch current status directly from database to prevent stale token hijacking
      const { rows } = await query(
        'SELECT role, active FROM users WHERE id = $1', 
        [req.user.id]
      );
      
      const liveUser = rows[0];

      // Block access instantly if an administrator disabled the account mid-session
      if (!liveUser || !liveUser.active) {
        return res.status(401).json({ error: 'This user account has been deactivated or removed' });
      }

      // Synchronize the request context user profile metadata with real-time database state variables
      req.user.role = liveUser.role;

      // 3. Hierarchical Permission Check
      const currentUserRank = ROLE_HIERARCHY[req.user.role] || 0;
      
      // Determine if the user matches one of the exact targeted roles OR outranks them natively
      const hasAccess = targets.some(role => {
        const requiredRank = ROLE_HIERARCHY[role] || 0;
        return req.user.role === role || currentUserRank >= requiredRank;
      });

      if (!hasAccess) {
        return res.status(403).json({ 
          error: `Access Denied: Your profile role authorization tier (${req.user.role}) cannot execute this operation.` 
        });
      }

      // Authorization passed successfully, forward request down the pipeline
      next();

    } catch (error) {
      console.error('RBAC Authorization verification engine fault:', error);
      return res.status(500).json({ 
        error: 'An internal error occurred while processing role privilege matrices.' 
      });
    }
  };
};
