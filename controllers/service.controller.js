import Service from "../models/Service.js";

/* =========================================================
   GET ALL SERVICES
========================================================= */
export const getServices = async (req, res) => {
  try {
    const services = await Service.find({ userId: req.user._id }).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      data: services,
    });
  } catch (err) {
    console.error("GET_SERVICES_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve service items" });
  }
};

/* =========================================================
   CREATE NEW SERVICE
========================================================= */
export const createService = async (req, res) => {
  try {
    const { name, price, category, description } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({ success: false, message: "Required catalog parameters are missing" });
    }

    // Check for unique naming conflicts under this specific shop context row
    const conflict = await Service.findOne({ userId: req.user._id, name: name.trim() });
    if (conflict) {
      return res.status(409).json({ success: false, message: "A service with this name already exists in your catalog" });
    }

    const newService = await Service.create({
      userId: req.user._id,
      name: name.trim(),
      price: Number(price),
      category,
      description: description || "",
    });

    return res.status(201).json({
      success: true,
      data: newService,
    });
  } catch (err) {
    console.error("CREATE_SERVICE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error creating service" });
  }
};

/* =========================================================
   UPDATE SERVICE
========================================================= */
export const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, description } = req.body;

    const service = await Service.findOne({ _id: id, userId: req.user._id });
    if (!service) {
      return res.status(404).json({ success: false, message: "Service item not found" });
    }

    if (name) {
      // Prevent updating to a name used by another item in their account catalog row
      const conflict = await Service.findOne({
        userId: req.user._id,
        name: name.trim(),
        _id: { $ne: id }
      });
      if (conflict) {
        return res.status(409).json({ success: false, message: "Another item is already using this service name" });
      }
      service.name = name.trim();
    }

    if (price !== undefined) service.price = Number(price);
    if (category) service.category = category;
    if (description !== undefined) service.description = description;

    await service.save();

    return res.status(200).json({
      success: true,
      data: service,
    });
  } catch (err) {
    console.error("UPDATE_SERVICE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error updating item parameters" });
  }
};

/* =========================================================
   DELETE SERVICE
========================================================= */
export const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Service.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!result) {
      return res.status(404).json({ success: false, message: "Service item link not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Service item deleted from catalog successfully",
    });
  } catch (err) {
    console.error("DELETE_SERVICE_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to execute catalog database removal" });
  }
};
