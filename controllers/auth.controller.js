import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/mail.service.js";

export const register = async (req, res) => {
  try {
    const { businessName, ownerName, email, password, phone, whatsapp, address, referralCode: incomingPromoCode, deviceId } = req.body;

    if (!businessName || !ownerName || !email || !password || !phone || !whatsapp || !address) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    // Check if user already exists
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: "User with this email already exists. Please login instead." });
    }

    // Handle referral code
    let parentReferrerId = null;
    if (incomingPromoCode?.trim()) {
      const parentUser = await pool.query("SELECT id FROM users WHERE referral_code = $1", [incomingPromoCode.trim().toUpperCase()]);
      if (parentUser.rows.length > 0) parentReferrerId = parentUser.rows[0].id;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Generate unique referral code
    let referralCode;
    for (let i = 0; i < 10 && !referralCode; i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      const exists = await pool.query("SELECT id FROM users WHERE referral_code = $1", [code]);
      if (exists.rows.length === 0) referralCode = code;
    }
    if (!referralCode) referralCode = crypto.randomBytes(6).toString("hex").toUpperCase();

    // Insert new user
    const insertUser = await pool.query(
      `INSERT INTO users (business_name, owner_name, email, password, phone, whatsapp, address, device_id, referred_by, referral_code, is_verified, verification_token, plan_status, plan, onboarding_step)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, email, business_name`,
      [
        businessName,
        ownerName,
        email.toLowerCase(),
        hashedPassword,
        phone,
        whatsapp,
        address,
        deviceId || null,
        parentReferrerId,
        referralCode,
        false,
        verificationToken,
        "inactive",
        null,
        "REGISTERED"
      ]
    );

    const user = insertUser.rows[0];

    try {
      await sendVerificationEmail({ email: user.email, token: verificationToken, businessName: user.business_name });
    } catch (mailError) {
      console.error("MAIL ERROR:", mailError);
    }

    return res.status(201).json({ success: true, message: "Registration successful. Please check your email for verification.", userId: user.id });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: "Verification token is required" });

    const result = await pool.query("SELECT id, is_verified FROM users WHERE verification_token = $1", [token]);
    const user = result.rows[0];

    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired verification token" });
    if (user.is_verified) return res.status(400).json({ success: false, message: "Email already verified" });

    await pool.query("UPDATE users SET is_verified = true, verification_token = null, onboarding_step = 'VERIFIED' WHERE id = $1", [user.id]);

    return res.status(200).json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
};

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role || "user" }, // ✅ use PostgreSQL id
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id }, // ✅ use PostgreSQL id
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

export const login = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid credentials" });
    if (!user.is_verified) return res.status(403).json({ success: false, message: "Please verify your email first" });

    if (deviceId) {
      await pool.query("UPDATE users SET device_id = $1 WHERE id = $2", [deviceId, user.id]);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await pool.query("UPDATE users SET refresh_token = $1, last_login_at = NOW() WHERE id = $2", [refreshToken, user.id]);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        businessName: user.business_name,
        ownerName: user.owner_name,
        email: user.email,
        role: user.role || "user",
        planStatus: user.plan_status,
        onboardingStep: user.onboarding_step,
        isVerified: user.is_verified,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


export const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ success: false, message: "Refresh token missing" });

    const secretKey = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET;
    const decoded = jwt.verify(token, secretKey);

    const result = await pool.query("SELECT * FROM users WHERE id = $1", [decoded.id]);
    const user = result.rows[0];
    if (!user || user.refresh_token !== token) {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }

    const nextAccessToken = generateAccessToken(user);
    return res.status(200).json({ success: true, accessToken: nextAccessToken, user });
  } catch (err) {
    console.error("REFRESH ERROR:", err.message);
    return res.status(401).json({ success: false, message: "Session expired" });
  }
};

export const staffLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    // Find receptionist by email
    const staffResult = await pool.query("SELECT * FROM receptionists WHERE email = $1", [email.toLowerCase().trim()]);
    const staff = staffResult.rows[0];

    if (!staff || staff.role.toLowerCase() !== "receptionist") {
      return res.status(401).json({ success: false, message: "Invalid credentials or staff clearance missing." });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    // Fetch parent owner profile
    const ownerResult = await pool.query("SELECT * FROM users WHERE id = $1", [staff.business_id]);
    const masterOwner = ownerResult.rows[0];

    if (!masterOwner || masterOwner.plan_status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Access Suspended: The master laundry plan subscription is currently inactive."
      });
    }

    // Sign receptionist token with shopOwnerId anchor
    const token = jwt.sign(
      {
        id: staff.id,
        role: staff.role,
        shopOwnerId: staff.business_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" } // Bound to operational shift timeline
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        businessName: masterOwner.business_name
      }
    });
  } catch (err) {
    console.error("STAFF_LOGIN_ERROR:", err);
    return res.status(500).json({ success: false, message: "Server workforce login runtime failure." });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }

    const result = await pool.query("SELECT id, email, business_name, owner_name FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];

    // Security best practice: don't reveal if user doesn't exist
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If that email address exists in our database, a recovery link has been dispatched."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      "UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3",
      [resetToken, expiresAt, user.id]
    );

    try {
      await sendPasswordResetEmail({
        email: user.email,
        token: resetToken,
        businessName: user.business_name || user.owner_name
      });
    } catch (mailError) {
      console.error("FORGOT PASSWORD MAIL ERROR:", mailError);
      return res.status(500).json({ success: false, message: "Failed to dispatch recovery mail. Try again." });
    }

    return res.status(200).json({
      success: true,
      message: "If that email address exists in our database, a recovery link has been dispatched."
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ success: false, message: "Server encountered an operational exception." });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: "Reset token signature is missing." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const result = await pool.query(
      "SELECT id FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()",
      [token]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ success: false, message: "Recovery token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await pool.query(
      "UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2",
      [hashedPassword, user.id]
    );

    return res.status(200).json({
      success: true,
      message: "Your account password has been updated successfully. Please log in."
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ success: false, message: "Server encountered an operational exception." });
  }
};

import pool from "../config/db.js";

export const logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    if (token) {
      // Find user by refresh token
      const result = await pool.query("SELECT id FROM users WHERE refresh_token = $1", [token]);
      const user = result.rows[0];

      if (user) {
        // Clear refresh token in DB
        await pool.query("UPDATE users SET refresh_token = NULL WHERE id = $1", [user.id]);
      }
    }

    // Clear cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    });

    return res.status(200).json({ success: true, message: "Logged out safely" });
  } catch (err) {
    console.error("LOGOUT ERROR:", err);
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};
