const router = require("express").Router();

const Referral = require("../models/Referral");
const Job = require("../models/JobRequirement");

const auth = require("../middleware/authMiddleware");
const limit = require("../middleware/subscriptionMiddleware");
const increaseUsage = require("../utils/usage");


/* =========================================
   NOTIFICATION ROUTES
========================================= */

const notificationRoutes =
  require("./notificationRoutes");


const normalize = v =>
  String(v || "")
    .replace(/\D/g, "")
    .slice(-10);


/* =========================================
   STATUS TRANSITIONS
========================================= */

const transitions = {

  New: [
    "Viewed",
    "Accepted",
    "Rejected"
  ],

  Viewed: [
    "Accepted",
    "Rejected"
  ],

  Accepted: [
    "Contacted",
    "Rejected"
  ],

  Contacted: [
    "Interview",
    "Rejected"
  ],

  Interview: [
    "Selected",
    "Rejected"
  ],

  Selected: [
    "Joined",
    "Rejected"
  ],

  Joined: [],

  Rejected: []

};


/* =========================================================
   CREATE REFERRAL
========================================================= */

router.post(

  "/",

  auth,

  limit("referrals"),

  async (req, res) => {

    try {

      const b = req.body;

      const mobile =
        normalize(b.workerMobile);


      /* =====================================
         VALIDATION
      ===================================== */

      if (

        !b.workerName ||

        !/^\d{10}$/.test(mobile) ||

        !b.jobId

      ) {

        return res.status(400).json({

          success: false,

          message:
            "Worker name, valid mobile and job are required"

        });

      }


      /* =====================================
         GET JOB
      ===================================== */

      const job =
        await Job.findById(b.jobId);


      if (

        !job ||

        job.status === "Closed" ||

        job.isClosedByAdmin === true ||

        job.workersFilled >=
          job.workersRequired

      ) {

        return res.status(400).json({

          success: false,

          message:
            "Job is not available"

        });

      }


      /* =====================================
         OWN JOB CHECK
      ===================================== */

      if (

        String(job.contractorId) ===
        String(req.contractorId)

      ) {

        return res.status(400).json({

          success: false,

          message:
            "You cannot refer to your own job"

        });

      }


      /* =====================================
         DUPLICATE REFERRAL CHECK
      ===================================== */

      const exists =
        await Referral.findOne({

          workerMobile:
            mobile,

          jobId:
            job._id,

          referredBy:
            req.contractorId,

          status:
            {
              $ne:
                "Rejected"
            }

        });


      if (exists) {

        return res.status(409).json({

          success: false,

          message:
            "This worker is already referred to this job"

        });

      }


      /* =====================================
         CREATE REFERRAL
      ===================================== */

      const referral =
        await Referral.create({

          ...b,

          workerMobile:
            mobile,

          jobId:
            job._id,

          referredBy:
            req.contractorId,

          referredTo:
            job.contractorId,


          skills:

            Array.isArray(b.skills)

              ? b.skills

              : String(b.skills || "")

                  .split(",")

                  .map(
                    x => x.trim()
                  )

                  .filter(Boolean)

        });


      /* =====================================
         SAVE NOTIFICATION
         + SEND FCM PUSH
      ===================================== */

      await notificationRoutes.createNotification(

        job.contractorId,

        "New Worker Referral",

        `A worker has been referred for ${job.jobTitle}`,

        "Referral",

        referral._id

      );


      /* =====================================
         INCREASE USAGE
      ===================================== */

      await increaseUsage(req);


      /* =====================================
         RESPONSE
      ===================================== */

      res.status(201).json({

        success: true,

        referral

      });

    }

    catch (error) {

      console.error(
        "CREATE REFERRAL ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Referral failed"

      });

    }

  }

);


/* =========================================================
   SENT REFERRALS
========================================================= */

router.get(

  "/sent",

  auth,

  async (req, res) => {

    try {

      const referrals =
        await Referral.find({

          referredBy:
            req.contractorId

        })

        .populate(

          "jobId",

          "jobTitle companyName"

        )

        .populate(

          "referredTo",

          "contractorName mobile"

        )

        .sort({

          createdAt:
            -1

        });


      res.json({

        success: true,

        referrals

      });

    }

    catch (error) {

      console.error(
        "SENT REFERRALS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to load referrals"

      });

    }

  }

);


/* =========================================================
   RECEIVED REFERRALS
========================================================= */

router.get(

  "/received",

  auth,

  async (req, res) => {

    try {

      const referrals =
        await Referral.find({

          referredTo:
            req.contractorId

        })

        .populate(

          "jobId",

          "jobTitle companyName"

        )

        .populate(

          "referredBy",

          "contractorName mobile"

        )

        .sort({

          createdAt:
            -1

        });


      res.json({

        success: true,

        referrals

      });

    }

    catch (error) {

      console.error(
        "RECEIVED REFERRALS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to load referrals"

      });

    }

  }

);


/* =========================================================
   UPDATE REFERRAL STATUS
========================================================= */

router.patch(

  "/:id/status",

  auth,

  async (req, res) => {

    try {

      const referral =
        await Referral.findById(
          req.params.id
        );


      if (!referral) {

        return res.status(404).json({

          success: false,

          message:
            "Referral not found"

        });

      }


      /* =====================================
         ONLY RECEIVING CONTRACTOR
      ===================================== */

      if (

        String(referral.referredTo) !==
        String(req.contractorId)

      ) {

        return res.status(403).json({

          success: false,

          message:
            "Only receiving contractor can update status"

        });

      }


      const status =
        req.body.status;


      /* =====================================
         VALID STATUS TRANSITION
      ===================================== */

      if (

        !transitions[
          referral.status
        ]

        ||

        !transitions[
          referral.status
        ].includes(status)

      ) {

        return res.status(400).json({

          success: false,

          message:

            `Cannot change ${referral.status} to ${status}`

        });

      }


      /* =====================================
         JOINED = INCREASE WORKER COUNT
      ===================================== */

      if (

        status === "Joined" &&

        !referral.joinedCounted

      ) {

        const job =
          await Job.findById(
            referral.jobId
          );


        if (

          !job ||

          job.status === "Closed" ||

          job.isClosedByAdmin === true ||

          job.workersFilled >=
            job.workersRequired

        ) {

          return res.status(400).json({

            success: false,

            message:
              "No vacancy remaining"

          });

        }


        job.workersFilled += 1;


        /* =====================================
           AUTO PARTIALLY FILLED / CLOSED
        ===================================== */

        if (

          job.workersFilled >=
          job.workersRequired

        ) {

          job.status =
            "Closed";

        }

        else {

          job.status =
            "Partially Filled";

        }


        await job.save();


        referral.joinedCounted =
          true;

      }


      /* =====================================
         UPDATE REFERRAL
      ===================================== */

      referral.status =
        status;


      if (

        req.body.notes !== undefined

      ) {

        referral.notes =
          req.body.notes;

      }


      await referral.save();


      /* =====================================
         SAVE NOTIFICATION
         + SEND FCM PUSH

         Notification goes to
         contractor who referred worker
      ===================================== */

      await notificationRoutes.createNotification(

        referral.referredBy,

        "Referral Status Updated",

        `Worker ${referral.workerName} status changed to ${status}`,

        "Referral",

        referral._id

      );


      res.json({

        success: true,

        referral

      });

    }

    catch (error) {

      console.error(
        "UPDATE REFERRAL STATUS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to update referral status"

      });

    }

  }

);


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
