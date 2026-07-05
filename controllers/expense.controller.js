import pool from "../config/db.js";

export const getExpenses = async (req, res) => {
  try {
    const { month } = req.query;
    const userId = req.user.id;

    let query = "SELECT * FROM expenses WHERE user_id = $1";
    let params = [userId];

    if (month) {
      query += " AND TO_CHAR(date, 'YYYY-MM') = $2";
      params.push(month);
    }

    query += " ORDER BY date DESC, created_at DESC";

    const result = await pool.query(query, params);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET_EXPENSES_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve expense records" });
  }
};

export const createExpense = async (req, res) => {
  try {
    const { name, description, method, paymentMethod, date, amount } = req.body;
    const userId = req.user.id;

    if (!name || amount === undefined || amount === null || !date) {
      return res.status(400).json({ success: false, message: "Expense name, date, and amount are required" });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ success: false, message: "Expense amount must be a valid non-negative number" });
    }

    const rawMethod = method || paymentMethod || "Cash";
    const normalizedMethod = String(rawMethod).trim().toLowerCase();
    const methodMap = { cash: "Cash", transfer: "Transfer", pos: "POS" };
    const finalMethod = methodMap[normalizedMethod] || rawMethod || "Cash";

    const result = await pool.query(
      `INSERT INTO expenses (user_id, name, description, method, date, amount)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [userId, name.trim(), description || "", finalMethod, date, parsedAmount]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("CREATE_EXPENSE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create expense record" });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, method, date, amount } = req.body;
    const userId = req.user.id;

    const existing = await pool.query("SELECT * FROM expenses WHERE id = $1 AND user_id = $2", [id, userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Expense record not found" });
    }

    let parsedAmount = existing.rows[0].amount;
    if (amount !== undefined) {
      parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ success: false, message: "Expense amount must be a valid non-negative number" });
      }
    }

    const result = await pool.query(
      `UPDATE expenses
       SET name = COALESCE($1,name),
           description = COALESCE($2,description),
           method = COALESCE($3,method),
           date = COALESCE($4,date),
           amount = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name?.trim(), description?.trim(), method, date, parsedAmount, id, userId]
    );

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("UPDATE_EXPENSE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update expense record" });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query("DELETE FROM expenses WHERE id = $1 AND user_id = $2", [id, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Expense record not found" });
    }

    return res.status(200).json({ success: true, message: "Expense removed successfully" });
  } catch (err) {
    console.error("DELETE_EXPENSE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to delete expense record" });
  }
};
