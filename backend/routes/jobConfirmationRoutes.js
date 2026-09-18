const router = require("express").Router();

const auth =
  require("../middleware/authMiddleware");

const dailyJobConfirmation =
  require("../services/dailyJobConfirmation");

const DailyJobConfirmation =
  require("../models/DailyJobConfirmation");


/* =========================================================
   GET TODAY'S CONFIRMATION
========================================================= */

router.get(
  "/today",
  auth,
  async (req, res) => {

    try {

      const date =
        dailyJobConfirmation.getIndiaDate();

      const cycle =
        await DailyJobConfirmation.findOne({
          contractorId: req.contractorId,
          confirmationDate: date
        })
        .populate(
          "jobs.jobId",
          "jobTitle companyName companyLocation status"
        );

      res.json({
        success: true,
        date,
        cycle: cycle || null
      });

    } catch (error) {

      console.error(
        "GET TODAY CONFIRMATION ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to fetch today's confirmation"
      });

    }
  }
);


/* =========================================================
   OPEN JOB
========================================================= */

router.put(
  "/:jobId/open",
  auth,
  async (req, res) => {

    try {

      const cycle =
        await dailyJobConfirmation.confirmJobOpen(
          req.contractorId,
          req.params.jobId
        );

      res.json({
        success: true,
        message:
          "Job confirmed as OPEN",
        cycle
      });

    } catch (error) {

      console.error(
        "CONFIRM JOB OPEN ERROR:",
        error
      );

      res.status(400).json({
        success: false,
        message:
          error.message
      });

    }
  }
);


/* =========================================================
   CLOSE JOB
========================================================= */

router.put(
  "/:jobId/close",
  auth,
  async (req, res) => {

    try {

      const cycle =
        await dailyJobConfirmation.confirmJobClose(
          req.contractorId,
          req.params.jobId
        );

      res.json({
        success: true,
        message:
          "Job closed and deleted",
        cycle
      });

    } catch (error) {

      console.error(
        "CONFIRM JOB CLOSE ERROR:",
        error
      );

      res.status(400).json({
        success: false,
        message:
          error.message
      });

    }
  }
);


/* =========================================================
   RENDER CRON SCHEDULER
   Runs daily confirmation scheduler
========================================================= */

router.get(
  "/scheduler",
  async (req, res) => {

    try {

      /*
       * Optional CRON security.
       *
       * If CRON_SECRET is added in Render Environment,
       * Render Cron must send:
       *
       * x-cron-secret: YOUR_CRON_SECRET
       *
       * If CRON_SECRET is not configured, the endpoint
       * will still work.
       */

      const cronSecret =
        process.env.CRON_SECRET;

      if (cronSecret) {

        const receivedSecret =
          req.headers["x-cron-secret"];

        if (
          !receivedSecret ||
          receivedSecret !== cronSecret
        ) {

          return res.status(401).json({
            success: false,
            message:
              "Unauthorized scheduler request"
          });

        }

      }


      /* Run scheduler */

      await dailyJobConfirmation.runSchedulerTick();


      res.json({

        success: true,

        message:
          "Job confirmation scheduler executed",

        date:
          dailyJobConfirmation.getIndiaDate()

      });

    } catch (error) {

      console.error(
        "CRON SCHEDULER ERROR:",
        error
      );

      res.status(500).json({

        success: false,

        message:
          "Scheduler execution failed"

      });

    }
  }
);


module.exports = router;
