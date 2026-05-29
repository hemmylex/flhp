import axios from "axios";
import Payment from "../models/Payment.js";
import User from "../models/User.js";

const PAYSTACK_URL = "https://api.paystack.co";

/* =========================================================
   INITIALIZE PAYMENT (SECURED)
========================================================= */
export const initializePayment = async (req, res) => {
  try {
    const { amount, plan, metadata } = req.body;

    // 1. Enforce Server Trust: Extract email safely from the authenticated user token context
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please re-authenticate."
      });
    }

    const email = req.user.email;

    // 2. Request Paystack token transaction instance
    const response = await axios.post(
      `${PAYSTACK_URL}/transaction/initialize`,
      {
        email,
        amount: amount * 100, // Converts Naira to Kobo securely
        metadata: {
          ...metadata,
          plan: plan?.toLowerCase(), // Standardize to lower strings
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 3. Document the pending payment instance inside MongoDB
    await Payment.create({
      email,
      amount,
      plan: plan?.toLowerCase(), // Normalize identification tokens
      reference: response.data.data.reference,
      status: "pending",
    });

    // 4. Fixed: Explicitly merge the calculated amount variable payload back into Next.js data
    return res.status(200).json({
      success: true,
      data: {
        ...response.data.data,
        amount: amount * 100, // Explicitly provide kobo amount to frontend SDK
        email // Feeds email safely back to PaystackPop frontend layout parameters
      },
    });
  } catch (err) {
    console.error("PAYSTACK_INIT_CRITICAL_ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: err?.response?.data?.message || "Payment initialization failed",
    });
  }
};

/* =========================================================
   VERIFY PAYMENT
========================================================= */
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    // 1. Fetch live transaction data from Paystack
    const response = await axios.get(
      `${PAYSTACK_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = response.data.data;

    if (data.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment transaction not completed successfully",
      });
    }

    // 2. Query matching local transaction record
    const payment = await Payment.findOne({ reference });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment reference tracking record not found",
      });
    }

    // 3. Prevent multiple calculations on identical payloads
    if (payment.status === "success") {
      return res.json({
        success: true,
        message: "Transaction already fulfilled and verified",
      });
    }

    // 4. Fallback safe mapping keys configuration 
    const durationMap = {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    };

    const targetPlanKey = payment.plan?.toLowerCase() || "monthly";
    const daysToAdd = durationMap[targetPlanKey] || 30; // 30-day default layout safe block

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + daysToAdd);

    // 5. Update local billing transaction variables
    payment.status = "success";
    payment.paidAt = now;
    payment.expiresAt = expiresAt;
    payment.gatewayResponse = data;

    await payment.save();

    // 6. Synchronize profile authorization status parameters on the matching User profile
    const user = await User.findOne({ email: payment.email });
    if (user) {
      // Aligns fields precisely with RouteGuard and layout routing checkpoints
      user.plan = targetPlanKey;
      user.planStatus = "active"; 

      user.planDetails = {
        name: targetPlanKey.charAt(0).toUpperCase() + targetPlanKey.slice(1),
        price: payment.amount,
        duration: daysToAdd,
        description: `${user.planDetails?.description || "FOLO Laundry Pro Plan Active"}`
      };

      user.subscription = {
        reference,
        status: "active",
        amount: payment.amount,
        paidAt: now,
        expiresAt,
      };

      await user.save();
    }

    return res.json({
      success: true,
      message: "Payment successfully validated and user account activated",
    });
  } catch (err) {
    console.error("PAYSTACK_VERIFY_CRITICAL_ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: "Payment validation pipeline runtime failure",
    });
  }
};