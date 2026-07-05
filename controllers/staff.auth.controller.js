import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pool from "../db.js";

export const receptionistLogin = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM receptionists WHERE email = $1", [email.toLowerCase()]);
    const staff = result.rows[0];
    if (!staff || !staff.is_active) {
      return res.status(401).json({ success: false, message: "Invalid credentials or unauthorized access" });
    }

    const match = await bcrypt.compare(password, staff.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid credentials" });

    if (deviceId) {
      await pool.query("UPDATE receptionists SET device_id = $1 WHERE id = $2", [deviceId, staff.id]);
    }

    const accessToken = generateReceptionistAccessToken(staff);
    const refreshToken = generateReceptionistRefreshToken(staff);

    await pool.query("UPDATE receptionists SET refresh_token = $1, last_login_at = NOW() WHERE id = $2", [refreshToken, staff.id]);

    res.cookie("receptionistRefreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user: { id: staff.business_id, staffId: staff.id, name: staff.name, email: staff.email, role: "receptionist" }
    });
  } catch (err) {
    console.error("RECEPTIONIST LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const generateReceptionistAccessToken = (staff) => {
  return jwt.sign(
    { id: staff.business_id, staffId: staff.id, role: "receptionist" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateReceptionistRefreshToken = (staff) => {
  return jwt.sign(
    { id: staff.id },
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

export const receptionistRefreshToken = async (req, res) => {
  try {
    const token = req.cookies?.receptionistRefreshToken;
    if (!token) return res.status(401).json({ success: false, message: "Refresh token missing" });

    const secretKey = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET;
    const decoded = jwt.verify(token, secretKey);

    const result = await pool.query("SELECT * FROM receptionists WHERE id = $1 AND is_active = TRUE", [decoded.id]);
    const staff = result.rows[0];
    if (!staff || staff.refresh_token !== token) {
      return res.status(401).json({ success: false, message: "Invalid session configuration" });
    }

    const nextAccessToken = generateReceptionistAccessToken(staff);

    return res.status(200).json({
      success: true,
      accessToken: nextAccessToken,
      user: { id: staff.business_id, staffId: staff.id, name: staff.name, email: staff.email, role: "receptionist" }
    });
  } catch (err) {
    console.error("RECEPTIONIST REFRESH CRASH:", err.message);
    return res.status(401).json({ success: false, message: "Session expired" });
  }
};

export const receptionistLogout = async (req, res) => {
  try {
    const token = req.cookies?.receptionistRefreshToken;
    if (token) {
      await pool.query("UPDATE receptionists SET refresh_token = NULL WHERE refresh_token = $1", [token]);
    }

    res.clearCookie("receptionistRefreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax"
    });

    return res.status(200).json({ success: true, message: "Logged out safely from staff portal" });
  } catch (err) {
    console.error("RECEPTIONIST LOGOUT ERROR:", err);
    return res.status(500).json({ success: false, message: "Logout runtime exception" });
  }
};
