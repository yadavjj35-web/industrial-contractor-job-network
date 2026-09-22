const router = require("express").Router();
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const Contractor = require("../models/Contractor");
const Job = require("../models/JobRequirement");
const Referral = require("../models/Referral");
const Subscription = require("../models/Subscription");

const adminAuth = require("../middleware/adminMiddleware");

/* =========================================================
ADMIN LOGIN
========================================================= */

router.post("/login", async (req, res) => {

  try {

    const admin =
      await Admin
        .findOne({
          email:
            String(
              req.body.email || ""
            ).toLowerCase()
        })
        .select("+password");

    if (
      !admin ||
      !(await admin.comparePassword(
        req.body.password || ""
      ))
    ) {

      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });

    }

    if (!admin.isActive) {

      return res.status(403).json({
        success: false,
        message: "Admin inactive"
      });

    }

    const token =
      jwt.sign(
        {
          adminId: admin._id,
          role: "admin"
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "30d"
        }
      );

    return res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });

  } catch (err) {

    console.error(
      "ADMIN LOGIN ERROR:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });

  }

});


/* =========================================================
ADMIN DASHBOARD
========================================================= */

router.get(
  "/dashboard",
  adminAuth,
  async (req, res) => {

    try {

      const [
        total,
        pending,
        approved,
        jobs,
        activeJobs,
        referrals,
        joined,
        subs
      ] = await Promise.all([

        Contractor.countDocuments(),

        Contractor.countDocuments({
          verificationStatus:
            "Pending"
        }),

        Contractor.countDocuments({
          verificationStatus:
            "Approved"
        }),

        Job.countDocuments(),

        Job.countDocuments({
          status: {
            $in: [
              "Active",
              "Partially Filled"
            ]
          }
        }),

        Referral.countDocuments(),

        Referral.countDocuments({
          status: "Joined"
        }),

        Subscription.find({
          status: "Active"
        })

      ]);

      const revenue =
        subs.reduce(
          (sum, item) =>
            sum + (item.price || 0),
          0
        );

      return res.json({
        success: true,
        stats: {
          total,
          pending,
          approved,
          jobs,
          activeJobs,
          referrals,
          joined,
          revenue
        }
      });

    } catch (err) {

      console.error(
        "ADMIN DASHBOARD ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load dashboard"
      });

    }

  }
);


/* =========================================================
GET CONTRACTORS
========================================================= */

router.get(
  "/contractors",
  adminAuth,
  async (req, res) => {

    try {

      const contractors =
        await Contractor
          .find()
          .select("-password")
          .sort({
            createdAt: -1
          });

      return res.json({
        success: true,
        contractors
      });

    } catch (err) {

      console.error(
        "ADMIN CONTRACTORS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load contractors"
      });

    }

  }
);


/* =========================================================
UPDATE CONTRACTOR
========================================================= */

router.patch(
  "/contractors/:id",
  adminAuth,
  async (req, res) => {

    try {

      const allowed = [
        "verificationStatus",
        "isActive"
      ];

      const update = {};

      allowed.forEach(key => {

        if (
          req.body[key] !== undefined
        ) {

          update[key] =
            req.body[key];

        }

      });

      const contractor =
        await Contractor.findByIdAndUpdate(
          req.params.id,
          update,
          {
            new: true
          }
        )
        .select("-password");

      if (!contractor) {

        return res.status(404).json({
          success: false,
          message:
            "Contractor not found"
        });

      }

      return res.json({
        success: true,
        contractor
      });

    } catch (err) {

      console.error(
        "UPDATE CONTRACTOR ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to update contractor"
      });

    }

  }
);


/* =========================================================
ADMIN ADD JOB FOR CONTRACTOR
=========================================================

Admin किसी भी contractor के behalf पर job create कर सकता है.

POST:
 /admin/contractors/:contractorId/jobs

========================================================= */

router.post(
  "/contractors/:contractorId/jobs",
  adminAuth,
  async (req, res) => {

    try {

      const contractor =
        await Contractor.findById(
          req.params.contractorId
        );

      if (!contractor) {

        return res.status(404).json({
          success: false,
          message:
            "Contractor not found"
        });

      }

      const b =
        req.body || {};


      /* =====================================================
         BASIC VALUES
      ===================================================== */

      const companyName =
        String(
          b.companyName || ""
        ).trim() ||
        contractor.contractorName ||
        "N/A";

      const companyLocation =
        String(
          b.companyLocation || ""
        ).trim();

      const jobTitle =
        String(
          b.jobTitle || ""
        ).trim();

      const qualification =
        String(
          b.qualification || ""
        ).trim();

      const trade =
        String(
          b.trade || ""
        ).trim();


      /* =====================================================
         REQUIRED FIELDS
      ===================================================== */

      if (!jobTitle) {

        return res.status(400).json({
          success: false,
          message:
            "Job title is required"
        });

      }

      if (!companyLocation) {

        return res.status(400).json({
          success: false,
          message:
            "Location is required"
        });

      }

      if (!qualification) {

        return res.status(400).json({
          success: false,
          message:
            "Qualification is required"
        });

      }

      if (!trade) {

        return res.status(400).json({
          success: false,
          message:
            "Trade is required"
        });

      }

      if (
        b.experienceMin ===
          undefined ||
        b.experienceMin ===
          null ||
        b.experienceMin === ""
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Experience is required"
        });

      }


      /* =====================================================
         EXPERIENCE
      ===================================================== */

      const experienceMin =
        Number(
          b.experienceMin
        );

      if (
        Number.isNaN(
          experienceMin
        ) ||
        experienceMin < 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid minimum experience"
        });

      }


      const experienceMax =
        b.experienceMax === "" ||
        b.experienceMax ===
          undefined ||
        b.experienceMax ===
          null
          ? 99
          : Number(
              b.experienceMax
            );

      if (
        Number.isNaN(
          experienceMax
        ) ||
        experienceMax <
          experienceMin
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid maximum experience"
        });

      }


      /* =====================================================
         WORKERS REQUIRED
         
         अभी optional रखा गया है.
         अगर खाली है तो null.
      ===================================================== */

      const workersRequired =
        b.workersRequired === "" ||
        b.workersRequired ===
          null ||
        b.workersRequired ===
          undefined
          ? null
          : Number(
              b.workersRequired
            );

      if (
        workersRequired !== null &&
        (
          !Number.isInteger(
            workersRequired
          ) ||
          workersRequired < 1
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid workers required"
        });

      }


      /* =====================================================
         GENDER
      ===================================================== */

      const allowedGender = [
        "Any",
        "Male",
        "Female",
        "Other"
      ];

      const gender =
        allowedGender.includes(
          String(
            b.gender || ""
          )
        )
          ? String(
              b.gender
            )
          : "Any";


      /* =====================================================
         SALARY
      ===================================================== */

      const salaryMin =
        b.salaryMin === "" ||
        b.salaryMin ===
          null ||
        b.salaryMin ===
          undefined
          ? 0
          : Number(
              b.salaryMin
            );

      const salaryMax =
        b.salaryMax === "" ||
        b.salaryMax ===
          null ||
        b.salaryMax ===
          undefined
          ? 0
          : Number(
              b.salaryMax
            );


      if (
        Number.isNaN(
          salaryMin
        ) ||
        salaryMin < 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid minimum salary"
        });

      }

      if (
        Number.isNaN(
          salaryMax
        ) ||
        salaryMax < 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid maximum salary"
        });

      }


      /* =====================================================
         SKILLS
      ===================================================== */

      let skills = [];

      if (
        Array.isArray(
          b.skills
        )
      ) {

        skills =
          b.skills
            .flatMap(item =>
              String(
                item || ""
              ).split(",")
            )
            .map(item =>
              String(
                item || ""
              ).trim()
            )
            .filter(Boolean);

      } else {

        skills =
          String(
            b.skills || ""
          )
            .split(",")
            .map(item =>
              item.trim()
            )
            .filter(Boolean);

      }


      /* =====================================================
         JOB DATA
      ===================================================== */

      const jobData = {

        companyName,

        companyLocation,

        jobTitle,

        qualification,

        trade,

        workersRequired,

        gender,

        experienceMin,

        experienceMax,

        salaryMin,

        salaryMax,

        skills,

        contractorId:
          contractor._id

      };


      /* =====================================================
         OPTIONAL FIELDS
      ===================================================== */

      const optionalFields = [

        "plantUnit",
        "department",
        "jobType",
        "industrialArea",
        "joiningDate",
        "lastDate",
        "benefits"

      ];

      optionalFields.forEach(
        field => {

          if (
            b[field] !==
            undefined
          ) {

            jobData[field] =
              b[field];

          }

        }
      );


      /* =====================================================
         CREATE JOB
      ===================================================== */

      const job =
        await Job.create(
          jobData
        );


      return res.status(201).json({

        success: true,

        message:
          "Job added successfully for contractor",

        job

      });

    } catch (err) {

      console.error(
        "ADMIN CREATE CONTRACTOR JOB ERROR:",
        err
      );


      if (
        err &&
        err.name ===
          "ValidationError"
      ) {

        const validationMessages =
          Object.values(
            err.errors || {}
          )
          .map(
            item =>
              item.message
          )
          .join(", ");

        return res.status(400).json({

          success: false,

          message:
            validationMessages ||
            "Job validation failed"

        });

      }


      return res.status(500).json({

        success: false,

        message:
          err.message ||
          "Unable to create job"

      });

    }

  }
);


/* =========================================================
GET ADMIN JOBS
========================================================= */

router.get(
  "/jobs",
  adminAuth,
  async (req, res) => {

    try {

      const jobs =
        await Job
          .find()
          .populate(
            "contractorId",
            "contractorName mobile"
          )
          .sort({
            createdAt: -1
          });

      return res.json({
        success: true,
        jobs
      });

    } catch (err) {

      console.error(
        "ADMIN JOBS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load jobs"
      });

    }

  }
);


/* =========================================================
ADMIN CLOSE JOB
========================================================= */

router.patch(
  "/jobs/:id/close",
  adminAuth,
  async (req, res) => {

    try {

      const job =
        await Job.findByIdAndUpdate(
          req.params.id,
          {
            status: "Closed",
            isClosedByAdmin: true
          },
          {
            new: true
          }
        );

      if (!job) {

        return res.status(404).json({
          success: false,
          message:
            "Job not found"
        });

      }

      return res.json({
        success: true,
        job
      });

    } catch (err) {

      console.error(
        "ADMIN CLOSE JOB ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to close job"
      });

    }

  }
);


/* =========================================================
REFERRALS
========================================================= */

router.get(
  "/referrals",
  adminAuth,
  async (req, res) => {

    try {

      const referrals =
        await Referral
          .find()
          .populate(
            "jobId",
            "jobTitle companyName"
          )
          .populate(
            "referredBy",
            "contractorName"
          )
          .populate(
            "referredTo",
            "contractorName"
          )
          .sort({
            createdAt: -1
          });

      return res.json({
        success: true,
        referrals
      });

    } catch (err) {

      console.error(
        "ADMIN REFERRALS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load referrals"
      });

    }

  }
);


/* =========================================================
SUBSCRIPTIONS
========================================================= */

router.get(
  "/subscriptions",
  adminAuth,
  async (req, res) => {

    try {

      const subscriptions =
        await Subscription
          .find()
          .populate(
            "contractorId",
            "contractorName mobile"
          );

      return res.json({
        success: true,
        subscriptions
      });

    } catch (err) {

      console.error(
        "ADMIN SUBSCRIPTIONS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load subscriptions"
      });

    }

  }
);


module.exports = router;
