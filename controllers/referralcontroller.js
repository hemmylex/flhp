import pool from "../config/db.js";

export const getReferralProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const currentUser = userResult.rows[0];
    if (!currentUser) return res.status(404).json({ success: false, message: "User profile not found." });

    const level1Result = await pool.query(
      "SELECT id, business_name, referral_code, is_first_payment_settled FROM users WHERE referred_by = $1",
      [userId]
    );
    const level1Children = level1Result.rows;

    const level1Ids = level1Children.map(c => c.id);
    let level2Children = [];
    if (level1Ids.length > 0) {
      const level2Result = await pool.query(
        "SELECT id, business_name, referral_code, referred_by, is_first_payment_settled FROM users WHERE referred_by = ANY($1)",
        [level1Ids]
      );
      level2Children = level2Result.rows;
    }

    return res.status(200).json({
      success: true,
      data: {
        tokenBalance: Number(currentUser.token_balance),
        earnedTokens: Number(currentUser.earned_tokens),
        redeemedTokens: Number(currentUser.redeemed_tokens),
        subscriptionDiscountBalance: Number(currentUser.subscription_discount_balance),
        subscriptionDiscountUsed: Number(currentUser.subscription_discount_used),
        totalDiscountEarned: Number(currentUser.subscription_discount_balance) + Number(currentUser.subscription_discount_used),
        tokenRedemptionHistory: currentUser.token_redemption_history || [],
        discountUsageHistory: currentUser.discount_usage_history || [],
        referralCode: currentUser.referral_code || "N/A",
        directReferralsCount: level1Children.length,
        tree: {
          id: currentUser.id,
          name: currentUser.business_name || "Your Business",
          code: currentUser.referral_code,
          children: level1Children.map(l1 => ({
            id: l1.id,
            name: l1.business_name || "Unknown Business",
            code: l1.referral_code,
            status: l1.is_first_payment_settled ? "active" : "pending",
            children: level2Children.filter(l2 => l2.referred_by === l1.id).map(l2 => ({
              id: l2.id,
              name: l2.business_name || "Unknown Business",
              code: l2.referral_code,
              status: l2.is_first_payment_settled ? "active" : "pending"
            }))
          }))
        }
      }
    });
  } catch (err) {
    console.error("GET_REFERRAL_PROFILE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Unable to load referral profile." });
  }
};

export const redeemTokens = async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = Number(req.body.tokensToRedeem);

    if (!Number.isFinite(amount)) {
      return res.status(400).json({ success: false, message: "Invalid token amount." });
    }
    if (amount < 10) {
      return res.status(400).json({ success: false, message: "Minimum redemption is 10 tokens." });
    }

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (Number(user.token_balance) < amount) {
      return res.status(400).json({ success: false, message: "Insufficient token balance." });
    }

    const discount = amount * 50; // TOKEN_TO_NAIRA_RATE

    const newTokenBalance = Number(user.token_balance) - amount;
    const newRedeemedTokens = Number(user.redeemed_tokens) + amount;
    const newDiscountBalance = Number(user.subscription_discount_balance) + discount;

    const newHistory = [...(user.token_redemption_history || []), {
      tokens: amount,
      discount,
      status: "Converted",
      createdAt: new Date()
    }];

    const updated = await pool.query(
      `UPDATE users
       SET token_balance = $1,
           redeemed_tokens = $2,
           subscription_discount_balance = $3,
           token_redemption_history = $4
       WHERE id = $5
       RETURNING *`,
      [newTokenBalance, newRedeemedTokens, newDiscountBalance, JSON.stringify(newHistory), userId]
    );

    const latestRedemption = newHistory[newHistory.length - 1];

    return res.status(200).json({
      success: true,
      message: "Tokens converted successfully.",
      data: {
        tokenBalance: newTokenBalance,
        earnedTokens: updated.rows[0].earned_tokens,
        redeemedTokens: newRedeemedTokens,
        subscriptionDiscountBalance: newDiscountBalance,
        subscriptionDiscountUsed: updated.rows[0].subscription_discount_used,
        totalDiscountEarned: newDiscountBalance + Number(updated.rows[0].subscription_discount_used),
        redeemedAmount: discount,
        latestRedemption
      }
    });
  } catch (err) {
    console.error("TOKEN_REDEMPTION_ERROR:", err);
    return res.status(500).json({ success: false, message: "Unable to redeem tokens." });
  }
};
