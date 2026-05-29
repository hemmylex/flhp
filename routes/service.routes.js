import express from "express";
import {
  getServices,
  createService,
  updateService,
  deleteService,
} from "../controllers/service.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// Apply authMiddleware globally across all pricing sub-routes
router.use(authMiddleware);

router.get("/", getServices);
router.post("/", createService);
router.put("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
