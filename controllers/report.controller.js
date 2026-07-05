import pool from "../config/db.js";

export const getReportSummary = async (req, res) => {
  try {
    const { month } = req.query; // format: "YYYY-MM"
    const targetOwnerId = req.user?.id;

    if (!targetOwnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Missing workspace session." });
    }

    let startDate, endDate;
    if (month && typeof month === "string" && month.includes("-")) {
      const [year, monthPart] = month.split("-");
      startDate = new Date(Number(year), Number(monthPart) - 1, 1);
      endDate = new Date(Number(year), Number(monthPart), 1);
    }

    const orderQuery = startDate
      ? "SELECT * FROM orders WHERE user_id = $1 AND created_at >= $2 AND created_at < $3"
      : "SELECT * FROM orders WHERE user_id = $1";

    const expenseQuery = startDate
      ? "SELECT * FROM expenses WHERE user_id = $1 AND created_at >= $2 AND created_at < $3"
      : "SELECT * FROM expenses WHERE user_id = $1";

    const [ordersResult, expensesResult] = await Promise.all([
      pool.query(orderQuery, startDate ? [targetOwnerId, startDate, endDate] : [targetOwnerId]),
      pool.query(expenseQuery, startDate ? [targetOwnerId, startDate, endDate] : [targetOwnerId])
    ]);

    const orders = ordersResult.rows;
    const expenses = expensesResult.rows;

    // Financial metrics
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.amount_paid || 0), 0);
    const outstanding = orders.reduce((sum, o) => sum + Number(o.balance_due || 0), 0);
    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Order lifecycle counts
    const completedOrders = orders.filter(o => o.order_status === "collected").length;
    const pendingOrders = orders.filter(o => o.order_status === "pending").length;
    const processingOrders = orders.filter(o => o.order_status === "processing").length;
    const readyOrders = orders.filter(o => o.order_status === "ready").length;

    // Payment mode breakdown
    const cashPayments = orders
      .filter(o => !o.payment_mode || String(o.payment_mode).toUpperCase() === "CASH")
      .reduce((sum, o) => sum + Number(o.amount_paid || 0), 0);

    const transferPayments = orders
      .filter(o => String(o.payment_mode).toUpperCase() === "TRANSFER")
      .reduce((sum, o) => sum + Number(o.amount_paid || 0), 0);

    const posPayments = orders
      .filter(o => String(o.payment_mode).toUpperCase() === "POS")
      .reduce((sum, o) => sum + Number(o.amount_paid || 0), 0);

    const summary = {
      income: totalRevenue,
      expenses: expensesTotal,
      profit: totalRevenue - expensesTotal,
      outstanding,
      orders: {
        total: orders.length,
        completed: completedOrders,
        pending: pendingOrders,
        processing: processingOrders,
        ready: readyOrders,
        inProgress: processingOrders + readyOrders
      },
      payments: {
        cash: cashPayments,
        transfer: transferPayments,
        pos: posPayments
      }
    };

    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    console.error("MONTH_REPORT_ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error in monthly report.", error: err.message });
  }
};

