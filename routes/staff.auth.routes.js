import express from "express";
import { 
  receptionistLogin, 
  receptionistRefreshToken, 
  receptionistLogout 
} from "../controllers/staff.auth.controller.js"; // Points to the isolated receptionist controllers

const router = express.Router();

router.post("/login", receptionistLogin);
router.post("/refresh-token", receptionistRefreshToken);
router.post("/logout", receptionistLogout);

export default router;
