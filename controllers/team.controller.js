import pool from "../config/db.js";
import bcrypt from "bcryptjs";

export const getBusinessReceptionists = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const result = await pool.query(
      `SELECT id, business_id, name, email, role, created_at
       FROM receptionists
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [ownerId]
    );

    return res.status(200).json({
      success: true,
      receptionists: result.rows,
    });
  } catch (err) {
    console.error("GET RECEPTIONISTS ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to read staff database." });
  }
};

export const createBusinessReceptionist = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const ownerId = req.user.id;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "All parameters are required." });
    }

    const existingStaff = await pool.query("SELECT id FROM receptionists WHERE email = $1", [email.toLowerCase()]);
    if (existingStaff.rows.length > 0) {
      return res.status(400).json({ success: false, message: "This email address is already assigned to a staff workspace." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const insertStaff = await pool.query(
      `INSERT INTO receptionists (business_id, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, business_id, name, email, role, created_at`,
      [ownerId, name.trim(), email.toLowerCase().trim(), hashedPassword, "receptionist"]
    );

    return res.status(201).json({
      success: true,
      message: "Staff member provisioned successfully.",
      receptionist: insertStaff.rows[0],
    });
  } catch (err) {
    console.error("CREATE RECEPTIONIST ERROR:", err);
    return res.status(500).json({ success: false, message: "Database execution error during provisioning." });
  }
};

export const updateBusinessReceptionist = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;
    const ownerId = req.user.id;

    const result = await pool.query("SELECT * FROM receptionists WHERE id = $1 AND business_id = $2", [id, ownerId]);
    const receptionist = result.rows[0];
    if (!receptionist) {
      return res.status(404).json({ success: false, message: "Staff profile not found within your workspace." });
    }

    let updatedName = receptionist.name;
    let updatedEmail = receptionist.email;
    let updatedPassword = receptionist.password;

    if (name) updatedName = name.trim();

    if (email) {
      const emailLower = email.toLowerCase().trim();
      if (emailLower !== receptionist.email) {
        const overlap = await pool.query("SELECT id FROM receptionists WHERE email = $1", [emailLower]);
        if (overlap.rows.length > 0) {
          return res.status(400).json({ success: false, message: "Email is already taken by another account." });
        }
        updatedEmail = emailLower;
      }
    }

    if (password && password.trim() !== "") {
      updatedPassword = await bcrypt.hash(password, 12);
    }

    const updateResult = await pool.query(
      `UPDATE receptionists
       SET name = $1, email = $2, password = $3
       WHERE id = $4 AND business_id = $5
       RETURNING id, business_id, name, email, role, created_at`,
      [updatedName, updatedEmail, updatedPassword, id, ownerId]
    );

    return res.status(200).json({
      success: true,
      message: "Staff parameters updated successfully.",
      receptionist: updateResult.rows[0],
    });
  } catch (err) {
    console.error("UPDATE RECEPTIONIST ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update staff parameters." });
  }
};

export const deleteBusinessReceptionist = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const deletionResult = await pool.query("DELETE FROM receptionists WHERE id = $1 AND business_id = $2", [id, ownerId]);

    if (deletionResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Staff account not found or unauthorized." });
    }

    return res.status(200).json({
      success: true,
      message: "Staff member access revoked completely.",
    });
  } catch (err) {
    console.error("DELETE RECEPTIONIST ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to clear account data from registry." });
  }
};
