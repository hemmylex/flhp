import express from "express";
import {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
} from "../controllers/team.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getTeamMembers);
router.post("/", createTeamMember);
router.put("/:id", updateTeamMember);
router.delete("/:id", deleteTeamMember);

export default router;
