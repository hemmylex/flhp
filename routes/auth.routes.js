import express from "express";
import { register, verifyEmail, login, refreshToken, logout } from "../controllers/auth.controller.js";
import validate from "../middleware/validate.js";
import { registerSchema } from "../validation/auth.schema.js";

const router = express.Router();

/**
 * REGISTER USER
 * - validates input via zod
 * - passes clean data to controller
 */
router.post(
  "/register",
  validate(registerSchema),
  register
);

/**
 * EMAIL VERIFICATION
 */
router.get("/verify-email", verifyEmail);

/**
 * LOGIN
 */
router.post("/login", login);

/**
 * REFRESH TOKEN
 */
router.post("/refresh-token", refreshToken);

/**
 * LOGOUT
 */
router.post("/logout", logout);

export default router;