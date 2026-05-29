import express from "express";
import {
  selectPlan,
  getCurrentPlan,
getAllPlans,
} from "../controllers/plan.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/all-plans", getAllPlans);

router.post("/select-plan", authMiddleware, selectPlan);

router.get("/current-plan", authMiddleware, getCurrentPlan);



export default router;