require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");

const Admin = require("./models/Admin");

require("./utils/firebase");

const dailyJobConfirmation =
  require("./services/dailyJobConfirmation");

const monthlyRewardScheduler =
  require("./services/monthlyRewardScheduler");

const app = express();


/* =========================================================
   TRUST PROXY
========================================================= */

app.set("trust proxy", 1);


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);


/* =========================================================
   LOGIN RATE LIMIT
========================================================= */

const loginLimiter = rateLimit({

  windowMs:
    15 * 60 * 1000,

  max: 20,

  message: {
    success: false,
    message:
      "Too many login attempts. Try later."
  }

});


app.use(
  "/api/contractors/login",
  loginLimiter
);

app.use(
  "/api/admin/login",
  loginLimiter
);


/* =========================================================
   API HOME
========================================================= */

app.get("/", (req, res) => {

  res.json({

    success: true,

    message:
      "Industrial Contractor Job Network API running"

  });

});


/* =========================================================
   ROUTES
========================================================= */

app.use(
  "/api/contractors",
  require("./routes/contractorRoutes")
);


app.use(
  "/api/jobs",
  require("./routes/jobRoutes")
);


app.use(
  "/api/referrals",
  require("./routes/referralRoutes")
);


/* =========================================================
   MONTHLY REWARD ROUTES
========================================================= */

app.use(
  "/api/monthly-rewards",
  require("./routes/monthlyRewardRoutes")
);


app.use(
  "/api/notifications",
  require("./routes/notificationRoutes")
);


app.use(
  "/api/job-confirmations",
  require("./routes/jobConfirmationRoutes")
);


app.use(
  "/api/subscription",
  require("./routes/subscriptionRoutes")
);


app.use(
  "/api/admin",
  require("./routes/adminRoutes")
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {

  console.error(
    "SERVER ERROR:",
    err
  );

  res.status(500).json({

    success: false,

    message:
      "Internal server error"

  });

});


/* =========================================================
   DATABASE + SERVER START
========================================================= */

connectDB()

  .then(async () => {

    /* =====================================================
       CREATE ADMIN IF NOT EXISTS
    ===================================================== */

    const email =
      (
        process.env.ADMIN_EMAIL ||
        "admin@example.com"
      ).toLowerCase();


    let admin =
      await Admin.findOne({
        email
      });


    if (!admin) {

      admin =
        await Admin.create({

          name:
            process.env.ADMIN_NAME ||
            "Super Admin",

          email,

          password:
            process.env.ADMIN_PASSWORD ||
            "ChangeMe123!"

        });


      console.log(
        "Admin created:",
        admin.email
      );

    } else {

      console.log(
        "Admin already exists:",
        admin.email
      );

    }


    /* =====================================================
       START SERVER
    ===================================================== */

    const PORT =
      process.env.PORT || 5000;


    app.listen(
      PORT,
      () => {

        console.log(
          `Server running on ${PORT}`
        );


        /* ===============================================
           DAILY JOB CONFIRMATION SCHEDULER

           Runs internally.
           No Render Cron required.
        =============================================== */

        try {

          dailyJobConfirmation
            .startDailyJobScheduler();

          console.log(
            "✅ Daily Job Confirmation Scheduler started"
          );

        }
        catch (error) {

          console.error(
            "❌ Daily Job Confirmation Scheduler failed:",
            error
          );

        }


        /* ===============================================
           MONTHLY REWARD SCHEDULER

           Verification:
           Every month on 15th

           Reward period:
           25th → 25th

           Runs internally.
           No Render Cron required.
        =============================================== */

        try {

          monthlyRewardScheduler
            .startMonthlyRewardScheduler();

          console.log(
            "✅ Monthly Reward Scheduler started"
          );

        }
        catch (error) {

          console.error(
            "❌ Monthly Reward Scheduler failed:",
            error
          );

        }


        console.log(
          "🚀 All internal schedulers initialized"
        );

      }
    );

  })

  .catch(err => {

    console.error(
      "❌ Database connection failed",
      err
    );

    process.exit(1);

  });
