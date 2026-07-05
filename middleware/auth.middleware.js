import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Access token missing. Authentication required." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from PostgreSQL
    const result = await pool.query(
      "SELECT id, business_name, owner_name, email, role, plan_status, onboarding_step, is_verified FROM users WHERE id = $1",
      [decoded.id]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: "User account profile no longer exists" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired" });
    }

    return res.status(401).json({ success: false, message: "Session invalid. Please login again." });
  }
};

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization token missing." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id, role: decoded.role };

    // Receptionists are anchored to their shop owner’s dataset
    req.shopOwnerId = decoded.role === "Receptionist" && decoded.shopOwnerId ? decoded.shopOwnerId : decoded.id;

    next();
  } catch (err) {
    console.error("TOKEN_VERIFY_GUARD_ERROR:", err.message);
    return res.status(401).json({ success: false, message: "Session token expired or invalid." });
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access Denied: Insufficient privileges." });
    }
    next();
  };
};

export const verifySharedBusinessAccess = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization token missing." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === "Receptionist") {
      req.businessId = decoded.shopOwnerId;
      req.userId = decoded.id;
      req.userRole = "Receptionist";
    } else {
      req.businessId = decoded.id;
      req.userId = decoded.id;
      req.userRole = decoded.role || "BusinessAdmin";
    }

    next();
  } catch (err) {
    console.error("SHARED WORKSPACE AUTH ERROR:", err.message);
    return res.status(401).json({ success: false, message: "Session expired or invalid." });
  }
};
