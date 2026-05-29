import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, 
    },
    orderId: {
      type: String,
      required: true,
      unique: true, 
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },
    whatsapp: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    items: {
      type: Array,
      default: [],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0, 
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
      default: 0, 
    },
    balanceDue: {
      type: Number,
      required: true,
      default: 0, 
    },
    orderStatus: {
      type: String,
      enum: ["pending", "processing", "ready", "collected"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },
    itemsCount: {
      type: Number,
      required: true,
      default: 1,
    },
    dueDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-calculate the balance due and payment status flags before saving rows
orderSchema.pre("save", async function () {
  this.itemsCount = Array.isArray(this.items) ? this.items.length : this.itemsCount || 1;
  this.balanceDue = Math.max(0, Number(this.totalAmount || 0) - Number(this.amountPaid || 0));
  
  if (Number(this.amountPaid || 0) === 0) {
    this.paymentStatus = "unpaid";
  } else if (Number(this.amountPaid || 0) >= Number(this.totalAmount || 0)) {
    this.paymentStatus = "paid";
  } else {
    this.paymentStatus = "partial";
  }
});

export default mongoose.models.Order || mongoose.model("Order", orderSchema);
