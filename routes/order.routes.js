import express from "express";
import {

  createOrder,
  getOrderById,
  getOrders,
  getOrderSummary,
  getInvoices,
  getPaymentHistory,

  updateOrderStatus,
  recordPayment,
} from "../controllers/order.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// Restrict all order endpoints to authenticated users
router.use(authMiddleware);

router.post("/", createOrder);
router.get("/summary", getOrderSummary);
router.get("/invoices", getInvoices);
router.get("/payments", getPaymentHistory);
router.get("/", getOrders);
router.get("/:id", getOrderById);
router.get("/", getOrders);
router.patch("/:id/status", updateOrderStatus);
router.patch("/:id/payment", recordPayment);

export default router;
