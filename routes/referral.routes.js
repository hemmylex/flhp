import express from "express";
import { getReferralProfile, redeemTokens } from "../controllers/referralcontroller.js";
import { authMiddleware } from "../middleware/auth.middleware.js"; 

const router = express.Router();

router.get("/profile", authMiddleware, getReferralProfile);
router.post("/redeem", authMiddleware, redeemTokens);
export default router;
