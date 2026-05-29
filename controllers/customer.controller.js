import Customer from "../models/Customer.js";
import Order from "../models/Order.js";

export const getCustomers = async (req, res) => {
  try {
    const persistedCustomers = await Customer.find({ userId: req.user._id }).sort({ name: 1 });

    if (persistedCustomers.length > 0) {
      return res.status(200).json({
        success: true,
        data: persistedCustomers,
      });
    }

    const aggregatedCustomers = await Order.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: {
            name: "$customerName",
            phone: "$customerPhone",
          },
          orders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          outstandingBalance: { $sum: "$balanceDue" },
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id.name",
          phone: "$_id.phone",
          orders: 1,
          totalSpent: 1,
          outstandingBalance: 1,
          whatsapp: "$whatsapp",
        },
      },
      { $sort: { name: 1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: aggregatedCustomers,
    });
  } catch (err) {
    console.error("GET_CUSTOMERS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve customer records" });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const { name, phone, whatsapp = "", address = "" } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Customer name and phone are required" });
    }

    const customer = await Customer.findOneAndUpdate(
      { userId: req.user._id, phone },
      {
        userId: req.user._id,
        name: name.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim(),
        address: address.trim(),
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (err) {
    console.error("CREATE_CUSTOMER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create customer record" });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, whatsapp, address } = req.body;

    const customer = await Customer.findOne({ _id: id, userId: req.user._id });
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer record not found" });
    }

    if (name) customer.name = name.trim();
    if (phone) customer.phone = phone.trim();
    if (whatsapp !== undefined) customer.whatsapp = whatsapp.trim();
    if (address !== undefined) customer.address = address.trim();

    await customer.save();

    return res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (err) {
    console.error("UPDATE_CUSTOMER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update customer record" });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Customer.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Customer record not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Customer removed successfully",
    });
  } catch (err) {
    console.error("DELETE_CUSTOMER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to delete customer record" });
  }
};
