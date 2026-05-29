import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    email: String,

    reference: {
      type: String,
      unique: true,
    },

    amount: Number,

    currency: {
      type: String,
      default: "NGN",
    },

    plan: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    paidAt: Date,

    expiresAt: Date,

    gatewayResponse: Object,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Payment", paymentSchema);