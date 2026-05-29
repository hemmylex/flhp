import express from "express";
import { getReportSummary } from "../controllers/report.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/summary", getReportSummary);

export default router;
