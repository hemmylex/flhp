import pool from "../config/db.js";

export const getServices = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM services WHERE user_id = $1 ORDER BY name ASC",
      [req.user.id]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET_SERVICES_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve service items" });
  }
};

export const createService = async (req, res) => {
  try {
    const { name, price, category, description } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({ success: false, message: "Required catalog parameters are missing" });
    }

    const conflict = await pool.query(
      "SELECT * FROM services WHERE user_id = $1 AND name = $2",
      [req.user.id, name.trim()]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ success: false, message: "A service with this name already exists in your catalog" });
    }

    const result = await pool.query(
      `INSERT INTO services (user_id, name, price, category, description)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.user.id, name.trim(), Number(price), category, description || ""]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("CREATE_SERVICE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error creating service" });
  }
};

export const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, description } = req.body;

    const existing = await pool.query("SELECT * FROM services WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Service item not found" });
    }

    if (name) {
      const conflict = await pool.query(
        "SELECT * FROM services WHERE user_id = $1 AND name = $2 AND id <> $3",
        [req.user.id, name.trim(), id]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({ success: false, message: "Another item is already using this service name" });
      }
    }

    const result = await pool.query(
      `UPDATE services
       SET name = COALESCE($1,name),
           price = COALESCE($2,price),
           category = COALESCE($3,category),
           description = COALESCE($4,description)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name?.trim(), price !== undefined ? Number(price) : null, category, description, id, req.user.id]
    );

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("UPDATE_SERVICE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error updating item parameters" });
  }
};

export const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("DELETE FROM services WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Service item not found" });
    }

    return res.status(200).json({ success: true, message: "Service item deleted from catalog successfully" });
  } catch (err) {
    console.error("DELETE_SERVICE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to execute catalog database removal" });
  }
};
