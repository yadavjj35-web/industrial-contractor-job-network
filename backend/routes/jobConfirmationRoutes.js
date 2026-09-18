const router =
  require("express").Router();

const auth =
  require("../middleware/authMiddleware");

const dailyJobConfirmation =
  require("../services/dailyJobConfirmation");


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

      const DailyJobConfirmation =
        require(
          "../models/DailyJobConfirmation"
        );

      const cycle =
        await DailyJobConfirmation.findOne({

          contractorId:
            req.contractorId,

          confirmationDate:
            date

        })
        .populate(
          "jobs.jobId",
          "jobTitle companyName companyLocation status"
        );

      res.json({

        success: true,

        date,

        cycle:
          cycle || null

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


module.exports =
  router;
