import pool from "../config/db.js";

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, business_name, owner_name, email, phone, whatsapp, address, bank_details,
              plan, plan_status, plan_details, expiry_date, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: "User account profile not found." });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error("GET_PROFILE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error retrieving profile." });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { businessName, ownerName, phone, whatsapp, address, bankDetails } = req.body;

    if (!businessName || !ownerName || !phone || !whatsapp || !address) {
      return res.status(400).json({ success: false, message: "All core profile parameters are required." });
    }

    if (bankDetails && bankDetails.accountNumber) {
      const cleanAccountNumber = String(bankDetails.accountNumber).replace(/[^0-9]/g, "");
      if (cleanAccountNumber.length !== 10 && cleanAccountNumber.length !== 0) {
        return res.status(400).json({ success: false, message: "NUBAN Account Number must be exactly 10 digits long." });
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET business_name = $1,
           owner_name = $2,
           phone = $3,
           whatsapp = $4,
           address = $5,
           bank_details = $6
       WHERE id = $7
       RETURNING id, business_name, owner_name, email, phone, whatsapp, address, bank_details`,
      [
        businessName.trim(),
        ownerName.trim(),
        phone.trim(),
        whatsapp.trim(),
        address.trim(),
        JSON.stringify({
          bankName: bankDetails?.bankName?.trim() || "",
          accountNumber: bankDetails?.accountNumber?.trim() || "",
          accountName: bankDetails?.accountName?.trim() || ""
        }),
        userId
      ]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Business profile details saved successfully!",
      data: updated.rows[0]
    });
  } catch (err) {
    console.error("UPDATE_PROFILE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update profile." });
  }
};

