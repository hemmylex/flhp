import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authMiddleware = async (req, res, next) => {
  try {
    // 1. Enforce rigorous extraction of the bearer access token exclusively
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        message: "Access token missing. Authentication required." 
      });
    }

    const token = authHeader.split(" ")[1];

    // 2. Decode using the exclusive access token secret block definition
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Select only the necessary identification fields to improve querying speeds
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User account profile no longer exists" });
    }

    // 4. Inject the user object seamlessly into the routing cycle execution scope
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);

    // If token is expired, explicitly flag it so the Axios interceptor triggers a refresh instantly
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }

    return res.status(401).json({ message: "Session invalid. Please login again." });
  }
};
