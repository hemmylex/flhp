import pool from "../config/db.js";

export const getCustomers = async (req, res) => {
  try {
    const userId = req.user.id;

    // Formal customers with metrics
    const result = await pool.query(
      `SELECT c.id, c.name, c.phone, c.whatsapp, c.address,
              COUNT(o.id) AS orders,
              COALESCE(SUM(o.amount_paid),0) AS total_spent,
              COALESCE(SUM(GREATEST(o.total_amount - o.amount_paid,0)),0) AS outstanding_balance
       FROM customers c
       LEFT JOIN orders o ON c.phone = o.customer_phone AND o.user_id = $1
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [userId]
    );

    if (result.rows.length > 0) {
      return res.status(200).json({ success: true, data: result.rows });
    }

    // Fallback: aggregate directly from orders if no formal customers
    const fallback = await pool.query(
      `SELECT customer_phone AS id,
              customer_name AS name,
              customer_phone AS phone,
              COUNT(*) AS orders,
              SUM(total_amount) AS total_spent,
              SUM(GREATEST(total_amount - amount_paid,0)) AS outstanding_balance,
              '' AS whatsapp
       FROM orders
       WHERE user_id = $1
       GROUP BY customer_name, customer_phone
       ORDER BY customer_name ASC`,
      [userId]
    );

    return res.status(200).json({ success: true, data: fallback.rows });
  } catch (err) {
    console.error("GET_CUSTOMERS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve customer records" });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const { name, phone, whatsapp = "", address = "" } = req.body;
    const userId = req.user.id;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Customer name and phone are required" });
    }

    const result = await pool.query(
      `INSERT INTO customers (user_id, name, phone, whatsapp, address)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, phone) DO UPDATE
       SET name = EXCLUDED.name,
           whatsapp = EXCLUDED.whatsapp,
           address = EXCLUDED.address
       RETURNING *`,
      [userId, name.trim(), phone.trim(), whatsapp.trim(), address.trim()]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("CREATE_CUSTOMER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create customer record" });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, whatsapp, address } = req.body;
    const userId = req.user.id;

    const result = await pool.query("SELECT * FROM customers WHERE id = $1 AND user_id = $2", [id, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Customer record not found" });
    }

    const updated = await pool.query(
      `UPDATE customers
       SET name = COALESCE($1,name),
           phone = COALESCE($2,phone),
           whatsapp = COALESCE($3,whatsapp),
           address = COALESCE($4,address)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name?.trim(), phone?.trim(), whatsapp?.trim(), address?.trim(), id, userId]
    );

    return res.status(200).json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error("UPDATE_CUSTOMER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update customer record" });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query("DELETE FROM customers WHERE id = $1 AND user_id = $2", [id, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Customer record not found" });
    }

    return res.status(200).json({ success: true, message: "Customer removed successfully" });
  } catch (err) {
    console.error("DELETE_CUSTOMER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to delete customer record" });
  }
};
