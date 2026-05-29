import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Speeds up pricing loads for individual shop profiles
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      enum: ["Clothing", "Cleaning", "Equipment", "Other"],
      default: "Clothing",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate service names under the same user account profile
serviceSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.models.Service || mongoose.model("Service", serviceSchema);
