import express from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { initializePayment, verifyPayment } from "../controllers/payment.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ======================================================
   PAYMENT INITIALIZATION
====================================================== */
router.post("/initialize", authMiddleware, initializePayment);

/* ======================================================
   PAYMENT VERIFICATION
====================================================== */
router.get("/verify/:reference", verifyPayment);

/* ======================================================
   PAYSTACK WEBHOOK (PostgreSQL version)
====================================================== */
router.post(
  "/webhook",
  async (req, res, next) => {
    try {
      let data = "";
      req.setEncoding("utf8");
      req.on("data", chunk => { data += chunk; });
      req.on("end", () => {
        req.rawBody = data;
        if (data && (!req.body || Object.keys(req.body).length === 0)) {
          try { req.body = JSON.parse(data); } catch (e) {}
        }
        next();
      });
    } catch (err) { next(err); }
  },
  async (req, res) => {
    try {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      const signature = req.headers["x-paystack-signature"];
      const rawPayload = req.rawBody;

      const hash = crypto.createHmac("sha512", secret).update(rawPayload).digest("hex");
      if (hash !== signature) {
        console.warn("Webhook Verification Blocked: Invalid Signature.");
        return res.status(401).json({ success: false, message: "Invalid signature" });
      }

      const event = req.body;
      if (event.event !== "charge.success") return res.sendStatus(200);

      const data = event.data;
      const reference = data.reference;
      const email = data.customer.email.toLowerCase();
      const amount = data.amount / 100;
      const metadata = data.metadata || {};
      const plan = metadata.plan?.toLowerCase();

      const validPlans = { monthly: 2000, quarterly: 6000, yearly: 24000 };
      if (!validPlans[plan]) return res.status(400).json({ success: false, message: "Invalid plan" });
      if (amount !== validPlans[plan]) return res.status(400).json({ success: false, message: "Amount mismatch" });

      const paymentResult = await pool.query("SELECT * FROM payments WHERE reference = $1", [reference]);
      const payment = paymentResult.rows[0];
      if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
      if (payment.status === "success") return res.sendStatus(200);

      const durationMap = { monthly: 30, quarterly: 90, yearly: 365 };
      const now = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(now.getDate() + durationMap[plan]);

      await pool.query(
        `UPDATE payments
         SET status = 'success', paid_at = $1, expires_at = $2, gateway_response = $3
         WHERE id = $4`,
        [now, expiresAt, JSON.stringify(data), payment.id]
      );

      const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      const user = userResult.rows[0];
      if (user) {
        await pool.query(
          `UPDATE users
           SET plan = $1,
               plan_status = 'active',
               plan_details = $2,
               subscription = $3
           WHERE id = $4`,
          [
            plan,
            JSON.stringify({
              name: plan.charAt(0).toUpperCase() + plan.slice(1),
              price: amount,
              duration: durationMap[plan],
              description: "FOLO Laundry Pro Plan Activated via Webhook"
            }),
            JSON.stringify({ reference, status: "active", amount, paidAt: now, expiresAt }),
            user.id
          ]
        );
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("PAYSTACK WEBHOOK ERROR:", err);
      return res.status(500).json({ success: false, message: "Webhook processing failed" });
    }
  }
);

export default router;
