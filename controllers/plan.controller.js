import pool from "../config/db.js";

export const getAllPlans = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM plans ORDER BY price ASC");
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET_ALL_PLANS_ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const selectPlan = async (req, res) => {
  try {
    const { plan } = req.body;

    const planResult = await pool.query("SELECT * FROM plans WHERE slug = $1", [plan]);
    const planDoc = planResult.rows[0];
    if (!planDoc) return res.status(400).json({ message: "Invalid plan package" });

    const planDetails = {
      name: planDoc.name,
      price: planDoc.price,
      duration: planDoc.duration,
      description: planDoc.description
    };

    await pool.query(
      `UPDATE users
       SET selected_plan = $1,
           plan_details = $2,
           plan_status = 'pending'
       WHERE id = $3`,
      [planDoc.slug, JSON.stringify(planDetails), req.user.id]
    );

    return res.json({ success: true, data: planDetails });
  } catch (err) {
    console.error("SELECT_PLAN_ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getCurrentPlan = async (req, res) => {
  try {
    const result = await pool.query("SELECT selected_plan, plan_details, plan_status, expiry_date FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];

    if (!user?.selected_plan) {
      return res.status(400).json({ message: "No plan selected" });
    }

    return res.json({
      success: true,
      data: {
        ...user.plan_details,
        status: user.plan_status,
        expiryDate: user.expiry_date
      }
    });
  } catch (err) {
    console.error("GET_CURRENT_PLAN_ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
