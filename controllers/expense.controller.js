import Expense from "../models/Expense.js";

export const getExpenses = async (req, res) => {
  try {
    const { month } = req.query;
    const filter = { userId: req.user._id };

    if (month) {
      filter.date = month;
    }

    const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: expenses,
    });
  } catch (err) {
    console.error("GET_EXPENSES_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve expense records" });
  }
};

export const createExpense = async (req, res) => {
  try {
    const { name, description, method, paymentMethod, date, amount } = req.body;

    if (!name || amount === undefined || amount === null || !date) {
      return res.status(400).json({ success: false, message: "Expense name, date, and amount are required" });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ success: false, message: "Expense amount must be a valid non-negative number" });
    }

    const rawMethod = method || paymentMethod || "Cash";
    const normalizedMethod = String(rawMethod).trim().toLowerCase();
    const methodMap = {
      cash: "Cash",
      transfer: "Transfer",
      pos: "POS",
    };
    const finalMethod = methodMap[normalizedMethod] || rawMethod || "Cash";

    const expense = await Expense.create({
      userId: req.user._id,
      name: name.trim(),
      description: description || "",
      method: finalMethod,
      date,
      amount: parsedAmount,
    });

    return res.status(201).json({
      success: true,
      data: expense,
    });
  } catch (err) {
    console.error("CREATE_EXPENSE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create expense record" });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, method, date, amount } = req.body;

    const expense = await Expense.findOne({ _id: id, userId: req.user._id });
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense record not found" });
    }

    if (name) expense.name = name.trim();
    if (description !== undefined) expense.description = description.trim();
    if (method) expense.method = method;
    if (date) expense.date = date;
    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ success: false, message: "Expense amount must be a valid non-negative number" });
      }
      expense.amount = parsedAmount;
    }

    await expense.save();

    return res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (err) {
    console.error("UPDATE_EXPENSE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update expense record" });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Expense.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Expense record not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Expense removed successfully",
    });
  } catch (err) {
    console.error("DELETE_EXPENSE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to delete expense record" });
  }
};
