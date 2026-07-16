// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import ms from 'ms'; // Utility used to parse environment text variables safely

export const COOKIE_NAME = 'voteflow_token';

// Guard clause to guarantee crypto key presence at startup
if (!process.env.JWT_SECRET) {
  console.error('FATAL SYSTEM EXCEPTION: process.env.JWT_SECRET variable context is undefined.');
  process.exit(1);
}

/**
 * Computes cookie expiration configurations relative to process environment settings
 */
const getSessionLifetime = () => {
  const expiryText = process.env.JWT_EXPIRES_IN || '7d';
  try {
    return ms(expiryText);
  } catch {
    return 7 * 24 * 60 * 60 * 1000; // Fallback back to 7 days if ms parsing fails
  }
};

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  const lifetime = getSessionLifetime();

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // Absolutely mandatory to stop client-side XSS scripting token leakage
    // CRITICAL FIX: sameSite 'none' allows the browser to securely pass cookies from localhost to Render
    sameSite: isProduction ? 'none' : 'lax', 
    secure: isProduction || process.env.COOKIE_SECURE === 'true', // Force secure HTTPS transmission natively
    maxAge: lifetime, // Dynamically matched directly to your JWT expiration threshold limits
    path: '/',
  });
}

export function clearAuthCookie(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.clearCookie(COOKIE_NAME, { 
    path: '/',
    httpOnly: true,
    // CRITICAL FIX: Must match option signatures exactly to successfully purge cookies from browser contexts
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction || process.env.COOKIE_SECURE === 'true',
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication session token required.' });
  }
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Extract token identity records cleanly into global Express application request parameters
    req.user = { 
      id: payload.sub, 
      role: payload.role, 
      email: payload.email 
    };
    
    next();
  } catch (jwtError) {
    console.warn(`Unauthorized endpoint request intercepted: ${jwtError.message}`);
    
    // Explicitly handle token expiration vs structural malformations
    if (jwtError.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Your login session has expired. Please sign in again.' });
    }
    
    return res.status(401).json({ error: 'Session credentials signature validation failed.' });
  }
}

/**
 * Relaxed Authentication Hook for Silent Token Renewals.
 * Decodes expired payloads safely without triggering an immediate 401 halt.
 */
export function requireExpiredAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Session renewal token missing.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Session renewal signature verification failed.' });
  }
}
