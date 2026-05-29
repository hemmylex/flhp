import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import compression from "compression";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import planRoutes from "./routes/plan.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import orderRoutes from "./routes/order.routes.js";

import customerRoutes from "./routes/customer.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import teamRoutes from "./routes/team.routes.js";
import reportRoutes from "./routes/reports.routes.js";
const app = express();

/* =========================================================
   TRUST PROXY
========================================================= */
app.set("trust proxy", 1);

/* =========================================================
   SECURITY HEADERS
========================================================= */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

/* =========================================================
   CORS CONFIGURATION
========================================================= */
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

const corsOptions = {
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Fixed: Enable pre-flight requests globally across all application API paths
app.options("all", cors(corsOptions));

/* =========================================================
   HTTP PARAM POLLUTION & COOKIES & COMPRESSION
========================================================= */
app.use(hpp());
app.use(cookieParser());
app.use(compression());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* =========================================================
   RATE LIMITER
========================================================= */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
});

app.use("/api", limiter);

/* =========================================================
   HEALTH CHECK
========================================================= */
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend running securely",
  });
});

/* =========================================================
   API ROUTES (CRITICAL ORDER FIX)
========================================================= */


// 2. Apply standard JSON body parsers globally down the tree AFTER payment paths
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// 3. Mount remaining API endpoints that rely on standard JSON objects
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/plans", planRoutes);
app.use("/api/v1/services", serviceRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/expenses", expenseRoutes);
app.use("/api/v1/team", teamRoutes);
app.use("/api/v1/reports", reportRoutes);

/* =========================================================
   404 HANDLER
========================================================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Something went wrong",
  });
});

export default app;
