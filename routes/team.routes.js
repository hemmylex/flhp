import express from "express";
import { 
  getBusinessReceptionists, 
  createBusinessReceptionist, 
  updateBusinessReceptionist, 
  deleteBusinessReceptionist,
} from "../controllers/team.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js"; 

const router = express.Router();
router.use(authMiddleware); 

router.route("/receptionists")
  .get(getBusinessReceptionists)
  .post(createBusinessReceptionist);

router.route("/receptionists/:id")
  .put(updateBusinessReceptionist)
  .delete(deleteBusinessReceptionist);

export default router;
