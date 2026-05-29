import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ["Receptionist", "Admin"],
      default: "Receptionist",
    },
    password: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

teamMemberSchema.index({ userId: 1, email: 1 }, { unique: true });

export default mongoose.models.TeamMember || mongoose.model("TeamMember", teamMemberSchema);
