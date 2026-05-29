import express from "express";
import crypto from "crypto";

import {
  initializePayment,
  verifyPayment,
} from "../controllers/payment.controller.js";

import { authMiddleware } from "../middleware/auth.middleware.js"; // 🔥 Imported your fixed auth guard
import Payment from "../models/Payment.js";
import User from "../models/User.js";

const router = express.Router();

/* ======================================================
   PAYMENT INITIALIZATION (FIXED #1: Guard applied)
====================================================== */
router.post("/initialize", authMiddleware, initializePayment);

/* ======================================================
   PAYMENT VERIFICATION
====================================================== */
router.get("/verify/:reference", verifyPayment);

/* ======================================================
   PAYSTACK WEBHOOK (FIXED #2: Stream buffer safe layout)
====================================================== */
/* ======================================================
   PAYSTACK WEBHOOK (FIXED: Safe extraction handler)
====================================================== */
router.post(
  "/webhook",
  // This middle tier function extracts raw buffers directly from the underlying request stream
  async (req, res, next) => {
    try {
      let data = "";
      req.setEncoding("utf8");

      req.on("data", (chunk) => {
        data += chunk;
      });

      req.on("end", () => {
        req.rawBody = data;
        // If the body wasn't parsed yet, populate req.body so the code doesn't break
        if (data && (!req.body || Object.keys(req.body).length === 0)) {
          try {
            req.body = JSON.parse(data);
          } catch (e) {
            // Ignore malformed text bodies safely
          }
        }
        next();
      });
    } catch (err) {
      next(err);
    }
  },
  async (req, res) => {
    try {
      /* =========================
         VERIFY SIGNATURE
      ========================= */
      const secret = process.env.PAYSTACK_SECRET_KEY;
      const signature = req.headers["x-paystack-signature"];
      
      // Use the isolated rawBody stream data to confirm verification integrity
      const rawPayload = req.rawBody;

      const hash = crypto
        .createHmac("sha512", secret)
        .update(rawPayload)
        .digest("hex");

      if (hash !== signature) {
        console.warn("Webhook Verification Blocked: Invalid Signature hash mismatch.");
        return res.status(401).json({
          success: false,
          message: "Invalid signature",
        });
      }


      /* =========================
         PARSE EVENT
      ========================= */
      const event = req.body;

      if (event.event !== "charge.success") {
        return res.sendStatus(200); // Acknowledge event types we don't care about
      }

      const data = event.data;
      const reference = data.reference;
      const email = data.customer.email;
      const amount = data.amount / 100; // Convert back from Kobo to Naira
      const metadata = data.metadata || {};
      const plan = metadata.plan?.toLowerCase(); // Fixed: Lowercase alignment lookup guard

      /* =========================
         VALIDATE PLAN
      ========================= */
      const validPlans = {
        monthly: 2000,
        quarterly: 6000,
        yearly: 24000,
      };

      if (!validPlans[plan]) {
        return res.status(400).json({
          success: false,
          message: "Invalid plan",
        });
      }

      /* =========================
         FRAUD CHECK
      ========================= */
      if (amount !== validPlans[plan]) {
        return res.status(400).json({
          success: false,
          message: "Amount mismatch",
        });
      }

      /* =========================
         FIND PAYMENT
      ========================= */
      const payment = await Payment.findOne({ reference });
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        });
      }

      /* =========================
         PREVENT DUPLICATES
      ========================= */
      if (payment.status === "success") {
        return res.sendStatus(200);
      }

      /* =========================
         SUBSCRIPTION DURATION
      ========================= */
      const durationMap = {
        monthly: 30,
        quarterly: 90,
        yearly: 365,
      };

      const now = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(now.getDate() + durationMap[plan]);

      /* =========================
         UPDATE PAYMENT
      ========================= */
      payment.status = "success";
      payment.paidAt = now;
      payment.expiresAt = expiresAt;
      payment.gatewayResponse = data;

      await payment.save();

      /* =========================
         ACTIVATE USER (FIXED #3: State alignment sync)
      ========================= */
      const user = await User.findOne({ email });
      if (user) {
        user.plan = plan;
        user.planStatus = "active"; // 🔥 Crucial alignment for RouteGuard loops

        user.planDetails = {
          name: plan.charAt(0).toUpperCase() + plan.slice(1),
          price: amount,
          duration: durationMap[plan],
          description: "FOLO Laundry Pro Plan Activated via Webhook"
        };

        user.subscription = {
          reference,
          status: "active",
          amount,
          paidAt: now,
          expiresAt,
        };

        await user.save();
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("PAYSTACK WEBHOOK ERROR:", err);
      return res.status(500).json({
        success: false,
        message: "Webhook processing failed",
      });
    }
  }
);

export default router;
