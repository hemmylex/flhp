import pool from "../config/db.js";
import axios from "axios";

const PAYSTACK_URL = "https://api.paystack.co";

export const initializePayment = async (req, res) => {
  try {
    const { amount, plan, metadata } = req.body;

    if (!req.user || !req.user.email || !req.user.id) {
      return res.status(401).json({ success: false, message: "Session expired. Please re-authenticate." });
    }

    const email = req.user.email;
    const userId = req.user.id;

    const response = await axios.post(
      `${PAYSTACK_URL}/transaction/initialize`,
      {
        email,
        amount: amount * 100,
        metadata: { ...metadata, plan: plan?.toLowerCase(), userId }
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    await pool.query(
      `INSERT INTO payments (user_id, email, amount, plan, reference, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, email.toLowerCase(), amount, plan?.toLowerCase(), response.data.data.reference, "pending"]
    );

    return res.status(200).json({
      success: true,
      data: { ...response.data.data, amount: amount * 100, email }
    });
  } catch (err) {
    console.error("PAYSTACK_INIT_CRITICAL_ERROR:", err?.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Payment initialization failed" });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await axios.get(`${PAYSTACK_URL}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });

    const data = response.data.data;
    if (data.status !== "success") {
      return res.status(400).json({ success: false, message: "Payment transaction not completed successfully" });
    }

    const paymentResult = await pool.query("SELECT * FROM payments WHERE reference = $1", [reference]);
    const payment = paymentResult.rows[0];
    if (!payment) return res.status(404).json({ success: false, message: "Payment reference not found" });
    if (payment.status === "success") return res.json({ success: true, message: "Transaction already verified" });

    const durationMap = { monthly: 30, quarterly: 90, yearly: 365 };
    const targetPlanKey = payment.plan?.toLowerCase() || "monthly";
    const daysToAdd = durationMap[targetPlanKey] || 30;

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + daysToAdd);

    await pool.query(
      `UPDATE payments SET status = 'success', paid_at = $1, expires_at = $2, gateway_response = $3 WHERE id = $4`,
      [now, expiresAt, JSON.stringify(data), payment.id]
    );

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [payment.user_id]);
    const user = userResult.rows[0];
    if (user) {
      await pool.query(
        `UPDATE users
         SET plan = $1,
             plan_status = 'active',
             onboarding_step = 'ACTIVE',
             plan_details = $2,
             expiry_date = $3,
             subscription = $4,
             is_first_payment_settled = TRUE
         WHERE id = $5`,
        [
          targetPlanKey,
          JSON.stringify({
            name: targetPlanKey.charAt(0).toUpperCase() + targetPlanKey.slice(1),
            price: payment.amount,
            duration: daysToAdd,
            description: user.plan_details?.description || "FOLO Laundry Pro Plan Active"
          }),
          expiresAt,
          JSON.stringify({ reference, status: "active", amount: payment.amount, paidAt: now, expiresAt }),
          user.id
        ]
      );

      // Referral bonus allocation
      if (!user.is_first_payment_settled && user.referred_by) {
        const level1 = await pool.query("SELECT * FROM users WHERE id = $1", [user.referred_by]);
        const level1Parent = level1.rows[0];
        if (level1Parent) {
          await pool.query(
            "UPDATE users SET token_balance = token_balance + 4, earned_tokens = earned_tokens + 4 WHERE id = $1",
            [level1Parent.id]
          );
          if (level1Parent.referred_by) {
            const level2 = await pool.query("SELECT * FROM users WHERE id = $1", [level1Parent.referred_by]);
            const level2Parent = level2.rows[0];
            if (level2Parent) {
              await pool.query(
                "UPDATE users SET token_balance = token_balance + 2, earned_tokens = earned_tokens + 2 WHERE id = $1",
                [level2Parent.id]
              );
            }
          }
        }
      }
    }

    return res.json({ success: true, message: "Payment successfully validated and user account activated" });
  } catch (err) {
    console.error("PAYSTACK_VERIFY_CRITICAL_ERROR:", err?.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Payment validation failed" });
  }
};
