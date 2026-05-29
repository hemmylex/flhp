import bcrypt from "bcryptjs";
import TeamMember from "../models/TeamMember.js";

export const getTeamMembers = async (req, res) => {
  try {
    const members = await TeamMember.find({ userId: req.user._id }).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      data: members,
    });
  } catch (err) {
    console.error("GET_TEAM_MEMBERS_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to retrieve team members" });
  }
};

export const createTeamMember = async (req, res) => {
  try {
    const { name, email, role, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }

    const normalizedRole = String(role || "Receptionist").trim().toLowerCase();
    const roleMap = {
      receptionist: "Receptionist",
      staff: "Receptionist",
      admin: "Admin",
    };
    const finalRole = roleMap[normalizedRole] || role || "Receptionist";

    const hashedPassword = await bcrypt.hash(password, 12);

    const member = await TeamMember.create({
      userId: req.user._id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: finalRole,
      password: hashedPassword,
    });

    const { password: _password, ...memberData } = member.toObject();

    return res.status(201).json({
      success: true,
      data: memberData,
    });
  } catch (err) {
    console.error("CREATE_TEAM_MEMBER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to create team member" });
  }
};

export const updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;

    const member = await TeamMember.findOne({ _id: id, userId: req.user._id });
    if (!member) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    const normalizedRole = String(role || "").trim().toLowerCase();
    const roleMap = {
      receptionist: "Receptionist",
      staff: "Receptionist",
      admin: "Admin",
    };

    if (name) member.name = name.trim();
    if (email) member.email = email.trim().toLowerCase();
    if (role) member.role = roleMap[normalizedRole] || role;
    if (password) member.password = await bcrypt.hash(password, 12);

    await member.save();

    const { password: _password, ...memberData } = member.toObject();

    return res.status(200).json({
      success: true,
      data: memberData,
    });
  } catch (err) {
    console.error("UPDATE_TEAM_MEMBER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to update team member" });
  }
};

export const deleteTeamMember = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await TeamMember.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Team member removed successfully",
    });
  } catch (err) {
    console.error("DELETE_TEAM_MEMBER_ERROR:", err);
    return res.status(500).json({ success: false, message: "Failed to delete team member" });
  }
};
