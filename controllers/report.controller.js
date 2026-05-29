import Expense from "../models/Expense.js";
import Order from "../models/Order.js";

export const getReportSummary = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id });
    const expenses = await Expense.find({ userId: req.user._id });

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.amountPaid || 0), 0);
    const outstanding = orders.reduce((sum, order) => sum + Number(order.balanceDue || 0), 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const completedOrders = orders.filter((order) => order.orderStatus === "collected").length;
    const pendingOrders = orders.filter((order) => order.orderStatus === "pending").length;
    const processingOrders = orders.filter((order) => order.orderStatus === "processing").length;
    const readyOrders = orders.filter((order) => order.orderStatus === "ready").length;

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
        inProgress: processingOrders + readyOrders,
      },
      payments: {
        cash: totalRevenue,
        transfer: 0,
        pos: 0,
      },
    };

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    console.error("GET_REPORT_SUMMARY_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve report summary" });
  }
};
