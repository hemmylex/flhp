import Order from "../models/Order.js";

export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      whatsapp,
      dueDate,
      totalAmount,
      items,
      notes,
      orderStatus,
      amountPaid = 0,
      orderId,
    } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({ success: false, message: "Customer name and phone are required." });
    }

    const numericTotal = Number(totalAmount);
    if (Number.isNaN(numericTotal) || numericTotal < 0) {
      return res.status(400).json({ success: false, message: "A valid total amount is required." });
    }

    const generatedOrderId = orderId || `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const newOrder = await Order.create({
      userId: req.user._id,
      orderId: generatedOrderId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      whatsapp: whatsapp?.trim() || "",
      notes: notes?.trim() || "",
      items: Array.isArray(items) ? items : [],
      totalAmount: numericTotal,
      amountPaid: Number(amountPaid) || 0,
      orderStatus: orderStatus || "pending",
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000 * 7),
    });

    return res.status(201).json({
      success: true,
      data: newOrder,
    });
  } catch (err) {
    console.error("CREATE_ORDER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create order record." });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({ _id: id, userId: req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order record not found." });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    console.error("GET_ORDER_BY_ID_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve order details." });
  }
};

export const getOrders = async (req, res) => {
  try {
    const { status, paymentStatus } = req.query;
    
    const queryCondition = { userId: req.user._id };

    if (status) queryCondition.orderStatus = status;
    if (paymentStatus) queryCondition.paymentStatus = paymentStatus;

    const orders = await Order.find(queryCondition).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (err) {
    console.error("GET_ORDERS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve order history." });
  }
};

export const getOrderSummary = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id });

    const totalOrders = orders.length;
    const pendingCount = orders.filter((order) => order.orderStatus === "pending").length;
    const processingCount = orders.filter((order) => order.orderStatus === "processing").length;
    const readyCount = orders.filter((order) => order.orderStatus === "ready").length;
    const collectedCount = orders.filter((order) => order.orderStatus === "collected").length;
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.amountPaid || 0), 0);
    const outstandingBalance = orders.reduce((sum, order) => sum + Number(order.balanceDue || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        totalOrders,
        pendingCount,
        processingCount,
        readyCount,
        collectedCount,
        totalRevenue,
        outstandingBalance,
        recentOrders: orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
      },
    });
  } catch (err) {
    console.error("GET_ORDER_SUMMARY_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve order summary." });
  }
};

export const getInvoices = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });

    const invoices = orders.map((order) => ({
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      dueDate: order.dueDate,
      totalAmount: order.totalAmount,
      balanceDue: order.balanceDue,
      paymentStatus: order.paymentStatus,
      status: order.orderStatus,
      createdAt: order.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: invoices,
    });
  } catch (err) {
    console.error("GET_INVOICES_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve invoice records." });
  }
};

export const getPaymentHistory = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id, amountPaid: { $gt: 0 } }).sort({ updatedAt: -1 });

    const payments = orders.map((order) => ({
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      amountPaid: order.amountPaid,
      balanceDue: order.balanceDue,
      paymentStatus: order.paymentStatus,
      method: "Cash",
      date: order.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (err) {
    console.error("GET_PAYMENT_HISTORY_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve payment history." });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "processing", "ready", "collected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid processing pipeline state." });
    }

    const order = await Order.findOne({ _id: id, userId: req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: "Laundry entry record not found." });
    }

    order.orderStatus = status;
    await order.save();

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    console.error("UPDATE_ORDER_STATUS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to progress order status." });
  }
};

export const recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentAmount } = req.body;

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      return res.status(400).json({ success: false, message: "Please enter a valid payment amount." });
    }

    const order = await Order.findOne({ _id: id, userId: req.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: "Invoice log not found." });
    }

    if (Number(paymentAmount) > order.balanceDue) {
      return res.status(400).json({ 
        success: false, 
        message: `Payment exceeds outstanding balance of ₦${order.balanceDue.toLocaleString()}` 
      });
    }

    order.amountPaid += Number(paymentAmount);
    await order.save();

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    console.error("RECORD_PAYMENT_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to register balance flow transaction." });
  }
};
