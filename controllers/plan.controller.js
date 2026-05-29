import Plan from "../models/Plan.js";
import User from "../models/User.js";

/* =========================================================
   GET ALL PLANS
========================================================= */
export const getAllPlans = async (req, res) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });

    return res.json({
      success: true,
      data: plans,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   SELECT PLAN
========================================================= */
export const selectPlan = async (req, res) => {
  try {
    const { plan } = req.body;

    // Fixed: Changed query property key to look up by slug definition matching database
    const planDoc = await Plan.findOne({ slug: plan });

    if (!planDoc) {
      return res.status(400).json({ message: "Invalid plan package" });
    }

    const user = await User.findById(req.user._id);

    // Fixed: Assigned slug string value to user document
    user.selectedPlan = planDoc.slug;

    user.planDetails = {
      name: planDoc.name,
      price: planDoc.price,
      duration: planDoc.duration,
      description: planDoc.description,
    };

    user.planStatus = "pending";

    await user.save();

    return res.json({
      success: true,
      data: user.planDetails,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
   GET CURRENT PLAN
========================================================= */
export const getCurrentPlan = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user?.selectedPlan) {
      return res.status(400).json({ message: "No plan selected" });
    }

    return res.json({
      success: true,
      data: user.planDetails,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};
