import pool from "../config/db.js";
import axios from "axios";

const PAYSTACK_URL = "https://api.paystack.co";

export const initializePlanRenewal = async (req, res) => {
  try {
    const { planId, appliedDiscount } = req.body;
    const { id: userId, email } = req.user;

    if (!planId || appliedDiscount === undefined || appliedDiscount < 0) {
      return res.status(400).json({ success: false, message: "Missing or invalid checkout parameters." });
    }

    const [planResult, userResult] = await Promise.all([
      pool.query("SELECT * FROM plans WHERE id = $1", [planId]),
      pool.query("SELECT * FROM users WHERE id = $1", [userId])
    ]);

    const plan = planResult.rows[0];
    const user = userResult.rows[0];

    if (!plan || !plan.is_active) {
      return res.status(404).json({ success: false, message: "Selected plan is inactive or missing." });
    }
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const basePriceKobo = Math.round(plan.price * 100);
    const availableBalanceKobo = Math.round(user.subscription_discount_balance * 100);
    const requestedDiscountKobo = Math.round(appliedDiscount * 100);

    const halfOfPlanPriceKobo = Math.floor(basePriceKobo / 2);
    const maxAllowedDiscountKobo = Math.min(halfOfPlanPriceKobo, availableBalanceKobo);

    if (requestedDiscountKobo > maxAllowedDiscountKobo) {
      return res.status(400).json({
        success: false,
        message: `Max discount allowed is ₦${(maxAllowedDiscountKobo / 100).toFixed(2)}.`
      });
    }

    const netChargedAmountKobo = basePriceKobo - requestedDiscountKobo;
    const finalAmountNaira = Number((netChargedAmountKobo / 100).toFixed(2));

    const response = await axios.post(
      `${PAYSTACK_URL}/transaction/initialize`,
      {
        email,
        amount: netChargedAmountKobo,
        metadata: { planId: plan.id, planSlug: plan.slug, appliedDiscount, userId }
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    await pool.query(
      `INSERT INTO payments (user_id, email, amount, plan, reference, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, email.toLowerCase(), finalAmountNaira, plan.slug, response.data.data.reference, "pending"]
    );

    return res.status(200).json({
      success: true,
      data: { ...response.data.data, amount: netChargedAmountKobo, email }
    });
  } catch (err) {
    console.error("PAYSTACK_RENEWAL_INIT_ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Payment renewal initialization failed" });
  }
};

export const verifyPlanRenewal = async (req, res) => {
  const { paymentReference } = req.body;
  const userId = req.user?.id;

  if (!userId || !paymentReference) {
    return res.status(400).json({ success: false, message: "Missing reference or user ID." });
  }

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const paystackResponse = await axios.get(`${PAYSTACK_URL}/transaction/verify/${paymentReference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });

    const txData = paystackResponse.data?.data;
    if (!paystackResponse.data?.status || txData.status !== "success") {
      return res.status(402).json({ success: false, message: "Paystack verification failed." });
    }

    const { planId, appliedDiscount } = txData.metadata;
    const planResult = await pool.query("SELECT * FROM plans WHERE id = $1", [planId]);
    const plan = planResult.rows[0];
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });

    const availableBalanceKobo = Math.round(user.subscription_discount_balance * 100);
    const requestedDiscountKobo = Math.round(appliedDiscount * 100);
    const historicalUsedKobo = Math.round(user.subscription_discount_used * 100);

    let expiryAnchor = new Date();
    if (user.expiry_date && new Date(user.expiry_date) > new Date()) {
      expiryAnchor = new Date(user.expiry_date);
    }
    const newExpiryDate = new Date(expiryAnchor.getTime());
    newExpiryDate.setDate(newExpiryDate.getDate() + plan.duration);

    const newBalance = Number(((availableBalanceKobo - requestedDiscountKobo) / 100).toFixed(2));
    const newUsed = Number(((historicalUsedKobo + requestedDiscountKobo) / 100).toFixed(2));

    await pool.query(
      `UPDATE users
       SET expiry_date = $1,
           subscription_discount_balance = $2,
           subscription_discount_used = $3,
           is_first_payment_settled = TRUE,
           plan = $4,
           selected_plan = $5,
           plan_status = 'active',
           plan_details = $6,
           discount_usage_history = COALESCE(discount_usage_history, '[]'::jsonb) || $7::jsonb
       WHERE id = $8`,
      [
        newExpiryDate,
        newBalance,
        newUsed,
        plan.slug,
        plan.slug,
        JSON.stringify({ name: plan.name, price: plan.price, duration: plan.duration, description: plan.description || "" }),
        JSON.stringify([{ amount: appliedDiscount, purpose: `Plan Renewal: ${plan.name} (${plan.duration} Days) - Ref: ${paymentReference}`, createdAt: new Date() }]),
        userId
      ]
    );

    await pool.query("UPDATE payments SET status = 'success' WHERE reference = $1", [paymentReference]);

    return res.status(200).json({
      success: true,
      data: {
        paymentReference,
        newExpiryDate,
        remainingDiscountBalance: newBalance,
        currentPlanStatus: "active"
      }
    });
  } catch (err) {
    console.error("VERIFICATION_EXECUTION_FAULT:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Internal server error during verification." });
  }
};
