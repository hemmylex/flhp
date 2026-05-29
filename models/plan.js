// models/Plan.js
import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true }, // monthly, yearly
    price: { type: Number, required: true },
    duration: { type: Number, required: true }, // days
    description: { type: String },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);