import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  businessName: String,
  ownerName: String,
  email: { type: String, unique: true, index: true },
  password: String,
  phone: String,
  whatsapp: String,
  address: String,
  referralCode: String,

  isVerified: { type: Boolean, default: false },
  verificationToken: String,

  onboardingStep: {
    type: String,
    enum: ["REGISTERED", "VERIFIED", "PLAN_SELECTED", "PAYMENT_PENDING", "ACTIVE"],
    default: "REGISTERED"
  },

  plan: { type: String, default: null },
  
  selectedPlan: { type: String, default: null },
  planStatus: { 
    type: String, 
    enum: ["inactive", "pending", "active", "expired"], 
    default: "inactive" 
  },

  planDetails: {
    name: { type: String },
    price: { type: Number },
    duration: { type: Number },
    description: { type: String }
  },


  planStatus: {
    type: String,
    default: "inactive",
  },

  deviceId: String,
  refreshToken: String,

  createdAt: { type: Date, default: Date.now }
},
{ timestamps: true });

export default mongoose.model("User", userSchema);