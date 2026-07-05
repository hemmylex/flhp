import pool from "../config/db.js";

export const createOrder = async (req, res) => {
  try {
    const {
      customerName, customerPhone, whatsapp, dueDate,
      totalAmount, items, notes, orderStatus,
      amountPaid = 0, paymentMode, orderId, discount = 0
    } = req.body;

    if (!customerName || !customerPhone) {
      return res.status(400).json({ success: false, message: "Customer name and phone are required." });
    }

    const numericTotal = Number(totalAmount);
    if (Number.isNaN(numericTotal) || numericTotal < 0) {
      return res.status(400).json({ success: false, message: "A valid total amount is required." });
    }

    const parsedAmountPaid = Number(amountPaid) || 0;
    const parsedDiscount = Number(discount) || 0;
    const netTotal = Math.max(0, numericTotal - parsedDiscount);
    const balanceDue = Math.max(0, netTotal - parsedAmountPaid);

    let paymentStatus = "unpaid";
    if (netTotal === 0 || parsedAmountPaid >= netTotal) paymentStatus = "paid";
    else if (parsedAmountPaid > 0) paymentStatus = "partial";

    const generatedOrderId = orderId || `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const result = await pool.query(
      `INSERT INTO orders (user_id, order_id, customer_name, customer_phone, whatsapp, notes, items, total_amount, amount_paid, discount, balance_due, payment_status, payment_mode, order_status, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        req.user.id, generatedOrderId, customerName.trim(), customerPhone.trim(),
        whatsapp?.trim() || "", notes?.trim() || "", JSON.stringify(items || []),
        numericTotal, parsedAmountPaid, parsedDiscount, balanceDue,
        paymentStatus, parsedAmountPaid > 0 ? (paymentMode || "CASH") : "",
        orderStatus || "pending", dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      ]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("CREATE_ORDER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create order record." });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM orders WHERE order_id = $1 AND user_id = $2", [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order record not found." });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("GET_ORDER_BY_ID_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve order details." });
  }
};

export const getOrders = async (req, res) => {
  try {
    const { status, paymentStatus } = req.query;
    let query = "SELECT * FROM orders WHERE user_id = $1";
    const params = [req.user.id];

    if (status) {
      params.push(status);
      query += ` AND order_status = $${params.length}`;
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      query += ` AND payment_status = $${params.length}`;
    }

    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET_ORDERS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve order history." });
  }
};

export const getOrderSummary = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders WHERE user_id = $1", [req.user.id]);
    const orders = result.rows;

    const totalOrders = orders.length;
    const pendingCount = orders.filter(o => o.order_status === "pending").length;
    const processingCount = orders.filter(o => o.order_status === "processing").length;
    const readyCount = orders.filter(o => o.order_status === "ready").length;
    const collectedCount = orders.filter(o => o.order_status === "collected").length;

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.amount_paid || 0), 0);
    const outstandingBalance = orders.reduce((sum, o) => sum + Number(o.balance_due || 0), 0);

    const recentOrders = orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

    return res.status(200).json({
      success: true,
      data: { totalOrders, pendingCount, processingCount, readyCount, collectedCount, totalRevenue, outstandingBalance, recentOrders }
    });
  } catch (err) {
    console.error("GET_ORDER_SUMMARY_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve order summary." });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "processing", "ready", "collected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid order status." });
    }

    const result = await pool.query(
      "UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *",
      [status, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("UPDATE_ORDER_STATUS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update order status." });
  }
};


export const getInvoices = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );

    const invoices = result.rows.map(order => {
      const baseTotal = Number(order.total_amount || 0);
      const discountApplied = Number(order.discount || 0);
      const depositReceived = Number(order.amount_paid || 0);

      const netTotalBill = Math.max(0, baseTotal - discountApplied);
      const calculatedBalanceDue = Math.max(0, netTotalBill - depositReceived);

      let computedPaymentStatus = "unpaid";
      if (netTotalBill === 0 || depositReceived >= netTotalBill) {
        computedPaymentStatus = "paid";
      } else if (depositReceived > 0) {
        computedPaymentStatus = "partial";
      }

      return {
        orderId: order.order_id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        dueDate: order.due_date,
        totalAmount: baseTotal,
        discount: discountApplied,
        balanceDue: calculatedBalanceDue,
        paymentStatus: computedPaymentStatus,
        status: order.order_status,
        createdAt: order.created_at,
      };
    });

    return res.status(200).json({ success: true, data: invoices });
  } catch (err) {
    console.error("GET_INVOICES_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve invoice records." });
  }
};


export const getPaymentHistory = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE user_id = $1 AND amount_paid > 0 ORDER BY updated_at DESC",
      [req.user.id]
    );

    const payments = result.rows.map(order => {
      const baseTotal = Number(order.total_amount || 0);
      const discountApplied = Number(order.discount || 0);
      const depositReceived = Number(order.amount_paid || 0);

      const netTotalBill = Math.max(0, baseTotal - discountApplied);
      const calculatedBalanceDue = Math.max(0, netTotalBill - depositReceived);

      return {
        orderId: order.order_id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        amountPaid: depositReceived,
        discount: discountApplied,
        balanceDue: calculatedBalanceDue,
        paymentStatus: order.payment_status,
        method: order.payment_mode || "CASH",
        date: order.updated_at,
      };
    });

    return res.status(200).json({ success: true, data: payments });
  } catch (err) {
    console.error("GET_PAYMENT_HISTORY_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve payment history." });
  }
};

export const recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentAmount, paymentMode } = req.body;

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      return res.status(400).json({ success: false, message: "Please enter a valid payment amount." });
    }

    // Fetch order
    const result = await pool.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [id, req.user.id]);
    const order = result.rows[0];
    if (!order) {
      return res.status(404).json({ success: false, message: "Invoice log not found." });
    }

    if (Number(paymentAmount) > Number(order.balance_due)) {
      return res.status(400).json({
        success: false,
        message: `Payment exceeds outstanding balance of ₦${Number(order.balance_due).toLocaleString()}`
      });
    }

    // Increment amount paid
    const newAmountPaid = Number(order.amount_paid) + Number(paymentAmount);

    // Recompute balance due
    const baseTotal = Number(order.total_amount || 0);
    const discountApplied = Number(order.discount || 0);
    const netTotalBill = Math.max(0, baseTotal - discountApplied);
    const newBalanceDue = Math.max(0, netTotalBill - newAmountPaid);

    // Recompute payment status
    let newPaymentStatus = "unpaid";
    if (netTotalBill === 0 || newAmountPaid >= netTotalBill) {
      newPaymentStatus = "paid";
    } else if (newAmountPaid === 0) {
      newPaymentStatus = "unpaid";
    } else {
      newPaymentStatus = "partial";
    }

    const updated = await pool.query(
      `UPDATE orders
       SET amount_paid = $1,
           balance_due = $2,
           payment_status = $3,
           payment_mode = COALESCE($4, payment_mode),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [newAmountPaid, newBalanceDue, newPaymentStatus, paymentMode, id, req.user.id]
    );

    return res.status(200).json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error("RECORD_PAYMENT_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to register balance flow transaction." });
  }
};
