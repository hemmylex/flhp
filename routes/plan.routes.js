import express from "express";
import {
  selectPlan,
  getCurrentPlan,
getAllPlans,
} from "../controllers/plan.controller.js";

import { initializePlanRenewal, verifyPlanRenewal  } from "../controllers/checkoutController.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/all-plans", getAllPlans);

router.post("/select-plan", authMiddleware, selectPlan);

router.get("/current-plan", authMiddleware, getCurrentPlan);

router.post("/initialize-renewal", authMiddleware, initializePlanRenewal);
router.post("/verify-renewal", authMiddleware, verifyPlanRenewal);

export default router;
