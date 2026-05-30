import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendVerificationEmail } from "../services/mail.service.js";

/* =========================================================
   REGISTER
========================================================= */
export const register = async (req, res) => {
  try {
    const {
      businessName,
      ownerName,
      email,
      password,
      phone,
      whatsapp,
      address,
      referralCode,
      deviceId,
    } = req.body;

    /* =========================
       REQUIRED VALIDATION
    ========================= */
    if (
      !businessName ||
      !ownerName ||
      !email ||
      !password ||
      !phone ||
      !whatsapp ||
      !address
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    /* =========================
       CHECK EXISTING USER
    ========================= */
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists. Please login instead.",
      });
    }

    /* =========================
       HASH PASSWORD
    ========================= */
    const hashedPassword = await bcrypt.hash(password, 12);

    /* =========================
       GENERATE EMAIL TOKEN
    ========================= */
    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    /* =========================
       CREATE USER
    ========================= */
    const user = await User.create({
      businessName,
      ownerName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      whatsapp,
      address,
      referralCode: referralCode || null,
      deviceId: deviceId || null,

      isVerified: false,
      verificationToken,

      planStatus: "inactive",
      plan: null,

      onboardingStep: "REGISTERED",
    });

    /* =========================
       SEND VERIFICATION EMAIL
    ========================= */
    try {
      await sendVerificationEmail({
        email: user.email,
        token: verificationToken,
        businessName: user.businessName
      });
    } catch (mailError) {
      console.error("MAIL ERROR:", mailError);
    }

    /* =========================
       RESPONSE
    ========================= */
    return res.status(201).json({
      success: true,
      message: "Registration successful. Please check your email for verification.",
      userId: user._id,
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/* =========================================================
   VERIFY EMAIL
========================================================= */
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.onboardingStep = "VERIFIED";

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });

  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Verification failed",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/* =========================================================
   TOKEN GENERATION UTILITIES
========================================================= */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

/* =========================================================
   LOGIN CONTROLLER
========================================================= */
export const login = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    if (deviceId) {
      user.deviceId = deviceId;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    // FIX 1: Set explicit production rules allowing cross-domain communication
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd, // Must be true on Render (HTTPS)
      sameSite: isProd ? "none" : "lax", // Must be "none" to share tokens across different domains
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        email: user.email,
        role: user.role || "user",
        planStatus: user.planStatus || "inactive",
        onboardingStep: user.onboardingStep,
        isVerified: user.isVerified,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendVerificationEmail } from "../services/mail.service.js";

/* =========================================================
   REGISTER
========================================================= */
export const register = async (req, res) => {
  try {
    const {
      businessName,
      ownerName,
      email,
      password,
      phone,
      whatsapp,
      address,
      referralCode,
      deviceId,
    } = req.body;

    /* =========================
       REQUIRED VALIDATION
    ========================= */
    if (
      !businessName ||
      !ownerName ||
      !email ||
      !password ||
      !phone ||
      !whatsapp ||
      !address
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    /* =========================
       CHECK EXISTING USER
    ========================= */
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists. Please login instead.",
      });
    }

    /* =========================
       HASH PASSWORD
    ========================= */
    const hashedPassword = await bcrypt.hash(password, 12);

    /* =========================
       GENERATE EMAIL TOKEN
    ========================= */
    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    /* =========================
       CREATE USER
    ========================= */
    const user = await User.create({
      businessName,
      ownerName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      whatsapp,
      address,
      referralCode: referralCode || null,
      deviceId: deviceId || null,

      isVerified: false,
      verificationToken,

      planStatus: "inactive",
      plan: null,

      onboardingStep: "REGISTERED",
    });

    /* =========================
       SEND VERIFICATION EMAIL
    ========================= */
    try {
      await sendVerificationEmail({
        email: user.email,
        token: verificationToken,
        businessName: user.businessName
      });
    } catch (mailError) {
      console.error("MAIL ERROR:", mailError);
    }

    /* =========================
       RESPONSE
    ========================= */
    return res.status(201).json({
      success: true,
      message: "Registration successful. Please check your email for verification.",
      userId: user._id,
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/* =========================================================
   VERIFY EMAIL
========================================================= */
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.onboardingStep = "VERIFIED";

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });

  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Verification failed",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/* =========================================================
   TOKEN GENERATION UTILITIES
========================================================= */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

/* =========================================================
   LOGIN CONTROLLER
========================================================= */
export const login = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    if (deviceId) {
      user.deviceId = deviceId;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    // FIX 1: Set explicit production rules allowing cross-domain communication
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProd, // Must be true on Render (HTTPS)
      sameSite: isProd ? "none" : "lax", // Must be "none" to share tokens across different domains
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        email: user.email,
        role: user.role || "user",
        planStatus: user.planStatus || "inactive",
        onboardingStep: user.onboardingStep,
        isVerified: user.isVerified,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* =========================================================
   REFRESH TOKEN CONTROLLER
========================================================= */
export const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({ success: false, message: "Refresh token missing" });
    }

    const secretKey = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET;
    const decoded = jwt.verify(token, secretKey);

    // Fetch live user model parameters
    const user = await User.findById(decoded.id).select("-password");

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ success: false, message: "Invalid session row configuration" });
    }

    const nextAccessToken = generateAccessToken(user);

    // FIX 2: Completed the truncated code and mapped out full response details cleanly
    return res.status(200).json({
      success: true,
      accessToken: nextAccessToken,
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        email: user.email,
        role: user.role || "user",
        planStatus: user.planStatus || "inactive",
        onboardingStep: user.onboardingStep,
        isVerified: user.isVerified,
      },
    });

  } catch (err) {
    console.error("REFRESH TOKEN ERROR:", err);
    return res.status(401).json({ 
      success: false, 
      message: "Session expired or invalid token" 
    });
  }
};
