require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const Admin = require("./models/Admin");
require("./utils/firebase");
const app = express();

app.set("trust proxy", 1);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many login attempts. Try later."
  }
});

app.use("/api/contractors/login", loginLimiter);
app.use("/api/admin/login", loginLimiter);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Industrial Contractor Job Network API running"
  });
});

app.use("/api/contractors", require("./routes/contractorRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/referrals", require("./routes/referralRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/subscription", require("./routes/subscriptionRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

connectDB()
  .then(async () => {

    // =========================
    // CREATE ADMIN IF NOT EXISTS
    // =========================

    const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();

    let admin = await Admin.findOne({ email });

    if (!admin) {
      admin = await Admin.create({
        name: process.env.ADMIN_NAME || "Super Admin",
        email,
        password: process.env.ADMIN_PASSWORD || "ChangeMe123!"
      });

      console.log("Admin created:", admin.email);
    } else {
      console.log("Admin already exists:", admin.email);
    }

    // =========================
    // START SERVER
    // =========================

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Database connection failed", err);
    process.exit(1);
  });
