const router = require("express").Router();

const jwt = require("jsonwebtoken");

const Referral =
  require("../models/Referral");

const Contractor =
  require("../models/Contractor");

const MonthlyRewardVerification =
  require("../models/MonthlyRewardVerification");

const auth =
  require("../middleware/authMiddleware");

const notificationRoutes =
  require("./notificationRoutes");


/* =====================================================
   CONSTANTS
===================================================== */

const REWARD_PER_WORKER_DEFAULT = 500;

const ADMIN_COMMISSION_PERCENT = 10;


/* =====================================================
   INDIA DATE HELPERS
===================================================== */

function getIndiaParts(date = new Date()) {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(date);


  const get =
    type =>
      Number(
        parts.find(
          p => p.type === type
        )?.value
      );


  return {
    year: get("year"),
    month: get("month"),
    day: get("day")
  };

}


/* =====================================================
   INDIA DATE STRING
===================================================== */

function indiaDateString(
  date = new Date()
) {

  const p =
    getIndiaParts(date);


  return `${p.year}-${String(
    p.month
  ).padStart(2, "0")}-${String(
    p.day
  ).padStart(2, "0")}`;

}


/* =====================================================
   IST MIDNIGHT → UTC DATE
===================================================== */

function istDateUTC(
  year,
  month,
  day
) {

  /*
   * month = 1-12
   *
   * IST = UTC + 5:30
   */

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0
    ) -
    (5.5 * 60 * 60 * 1000)
  );

}


/* =====================================================
   REWARD PERIOD

   Verification date:
   15 Sep 2026

   Reward period:
   25 Jul 2026 → 25 Aug 2026

   Verification date:
   15 Oct 2026

   Reward period:
   25 Aug 2026 → 25 Sep 2026
===================================================== */

function getRewardPeriod(
  inputDate = new Date()
) {

  let p =
    getIndiaParts(
      inputDate
    );


  /*
   * The monthly verification date
   * is always the 15th.
   *
   * If another day is supplied,
   * automatically use the 15th
   * of that same month.
   */

  if (
    p.day !== 15
  ) {

    const normalizedVerificationDate =
      istDateUTC(
        p.year,
        p.month,
        15
      );


    p =
      getIndiaParts(
        normalizedVerificationDate
      );

  }


  /*
   * Verification month
   */

  const verificationYear =
    p.year;

  const verificationMonth =
    p.month;


  /*
   * Reward period:
   *
   * Start = 25th of two months before
   * End   = 25th of previous month
   *
   * Example:
   *
   * 15 Sep
   *
   * Start:
   * 25 Jul
   *
   * End:
   * 25 Aug
   */


  let periodStartYear =
    verificationYear;

  let periodStartMonth =
    verificationMonth - 2;


  while (
    periodStartMonth <= 0
  ) {

    periodStartMonth += 12;

    periodStartYear -= 1;

  }


  let periodEndYear =
    verificationYear;

  let periodEndMonth =
    verificationMonth - 1;


  while (
    periodEndMonth <= 0
  ) {

    periodEndMonth += 12;

    periodEndYear -= 1;

  }


  const periodStart =
    istDateUTC(
      periodStartYear,
      periodStartMonth,
      25
    );


  const periodEnd =
    istDateUTC(
      periodEndYear,
      periodEndMonth,
      25
    );


  const normalizedVerificationDate =
    istDateUTC(
      verificationYear,
      verificationMonth,
      15
    );


  /*
   * Period label
   */

  const startParts =
    getIndiaParts(
      periodStart
    );

  const endParts =
    getIndiaParts(
      periodEnd
    );


  const startMonthName =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        month: "short"
      }
    ).format(
      periodStart
    );


  const endMonthName =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        month: "short"
      }
    ).format(
      periodEnd
    );


  const periodLabel =
    `25 ${startMonthName} ${startParts.year}`
    +
    ` → `
    +
    `25 ${endMonthName} ${endParts.year}`;


  return {

    periodStart,

    periodEnd,

    verificationDate:
      normalizedVerificationDate,

    periodLabel

  };

}


/* =====================================================
   FIND PERIOD FROM REQUEST

   Supports:

   ?verificationDate=2026-09-15

   OR

   ?month=2026-09
===================================================== */

function getPeriodFromRequest(
  req
) {

  let verificationDate;


  /* -----------------------------------------------------
     verificationDate=YYYY-MM-DD
  ----------------------------------------------------- */

  if (
    req.query.verificationDate
  ) {

    const raw =
      String(
        req.query.verificationDate
      );


    const match =
      raw.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );


    if (!match) {

      throw new Error(
        "Invalid verificationDate. Use YYYY-MM-DD"
      );

    }


    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      );

    const day =
      Number(
        match[3]
      );


    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {

      throw new Error(
        "Invalid verificationDate"
      );

    }


    verificationDate =
      istDateUTC(
        year,
        month,
        day
      );

  }


  /* -----------------------------------------------------
     month=YYYY-MM
  ----------------------------------------------------- */

  else if (
    req.query.month
  ) {

    const raw =
      String(
        req.query.month
      );


    const match =
      raw.match(
        /^(\d{4})-(\d{2})$/
      );


    if (!match) {

      throw new Error(
        "Invalid month. Use YYYY-MM"
      );

    }


    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      );


    if (
      month < 1 ||
      month > 12
    ) {

      throw new Error(
        "Invalid month"
      );

    }


    verificationDate =
      istDateUTC(
        year,
        month,
        15
      );

  }


  /* -----------------------------------------------------
     No date supplied
  ----------------------------------------------------- */

  else {

    const now =
      getIndiaParts();


    verificationDate =
      istDateUTC(
        now.year,
        now.month,
        15
      );

  }


  return getRewardPeriod(
    verificationDate
  );

}


/* =====================================================
   ADMIN AUTH MIDDLEWARE

   Admin token:
   localStorage.getItem("adminToken")

   JWT payload can contain:
   adminId
   id
   _id
   role
===================================================== */

async function adminAuth(
  req,
  res,
  next
) {

  try {

    const header =
      req.headers.authorization;


    if (
      !header ||
      !header.startsWith(
        "Bearer "
      )
    ) {

      return res.status(401).json({

        success: false,

        message:
          "Admin authorization required"

      });

    }


    const token =
      header.substring(7);


    const secret =
      process.env.JWT_SECRET;


    if (!secret) {

      console.error(
        "JWT_SECRET is missing"
      );


      return res.status(500).json({

        success: false,

        message:
          "Server authentication configuration missing"

      });

    }


    const decoded =
      jwt.verify(
        token,
        secret
      );


    /*
     * If role exists, it must be admin.
     *
     * Existing admin tokens without
     * role are still accepted when
     * they contain adminId/id/_id.
     */

    if (
      decoded.role &&
      String(
        decoded.role
      ).toLowerCase() !==
      "admin"
    ) {

      return res.status(403).json({

        success: false,

        message:
          "Admin access required"

      });

    }


    const adminId =
      decoded.adminId ||
      decoded.id ||
      decoded._id;


    if (!adminId) {

      return res.status(403).json({

        success: false,

        message:
          "Invalid admin token"

      });

    }


    req.adminId =
      adminId;


    req.admin =
      decoded;


    next();

  }
  catch (error) {

    console.error(
      "ADMIN AUTH ERROR:",
      error.message
    );


    return res.status(401).json({

      success: false,

      message:
        "Invalid or expired admin token"

    });

  }

}


/* =====================================================
   CREATE MONTHLY RECORDS

   Used by scheduler and manual generate endpoint.
===================================================== */

async function createMonthlyRecords(
  verificationDate = new Date()
) {

  const period =
    getRewardPeriod(
      verificationDate
    );


  /*
   * Only Joined referrals.
   *
   * New / Accepted / Rejected are ignored.
   */

  const referrals =
    await Referral.find({

      status: "Joined",

      $or: [

        {
          joinedAt: {
            $gte:
              period.periodStart,

            $lt:
              period.periodEnd
          }
        },

        /*
         * Old records where joinedAt
         * does not exist.
         *
         * updatedAt is used only as
         * compatibility fallback.
         */

        {
          joinedAt: null,

          updatedAt: {
            $gte:
              period.periodStart,

            $lt:
              period.periodEnd
          }
        }

      ]

    })
    .populate(
      "referredBy",
      "contractorName mobile"
    )
    .populate(
      "referredTo",
      "contractorName mobile"
    )
    .populate(
      "jobId",
      "jobTitle companyName"
    );


  let created =
    0;

  let existing =
    0;


  for (
    const referral
    of referrals
  ) {

    const joiningDate =
      referral.joinedAt ||
      referral.updatedAt ||
      null;


    /*
     * Prevent duplicate monthly record.
     */

    const alreadyExists =
      await MonthlyRewardVerification.findOne({

        referralId:
          referral._id,

        periodStart:
          period.periodStart,

        periodEnd:
          period.periodEnd

      });


    if (
      alreadyExists
    ) {

      existing++;

      continue;

    }


    await MonthlyRewardVerification.create({

      periodStart:
        period.periodStart,

      periodEnd:
        period.periodEnd,

      verificationDate:
        period.verificationDate,

      periodLabel:
        period.periodLabel,

      referralId:
        referral._id,

      referredBy:
        referral.referredBy?._id ||
        referral.referredBy,

      referredTo:
        referral.referredTo?._id ||
        referral.referredTo,

      workerName:
        referral.workerName,

      workerMobile:
        referral.workerMobile,

      joiningDate,

      receiverStatus:
        "Pending",

      receiverNote:
        "",

      receiverConfirmedAt:
        null,

      referrerStatus:
        "Pending",

      referrerNote:
        "",

      referrerConfirmedAt:
        null,

      finalStatus:
        "Pending",

      rewardPerWorker:
        REWARD_PER_WORKER_DEFAULT,

      rewardAmount:
        0,

      rewardStatus:
        "Pending",

      adminCommissionPercent:
        ADMIN_COMMISSION_PERCENT,

      adminCommission:
        0,

      contractorReward:
        0,

      paymentStatus:
        "Not Started",

      adminApprovalStatus:
        "Pending"

    });


    created++;

  }


  return {

    success: true,

    created,

    existing,

    total:
      referrals.length,

    period

  };

}


/* =====================================================
   MANUAL GENERATE

   POST:
   /api/monthly-rewards/generate

   Admin only
===================================================== */

router.post(
  "/generate",
  adminAuth,
  async (
    req,
    res
  ) => {

    try {

      const period =
        getPeriodFromRequest(
          req
        );


      const result =
        await createMonthlyRecords(
          period.verificationDate
        );


      res.json({

        success: true,

        message:
          "Monthly reward records generated",

        created:
          result.created,

        existing:
          result.existing,

        total:
          result.total,

        period: {

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          periodLabel:
            period.periodLabel

        }

      });

    }
    catch (error) {

      console.error(
        "GENERATE MONTHLY REWARD ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          error.message ||
          "Unable to generate monthly reward records"

      });

    }

  }
);


/* =====================================================
   RECEIVER CONTRACTOR

   GET:
   /api/monthly-rewards/receiver
===================================================== */

router.get(
  "/receiver",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const period =
        getPeriodFromRequest(
          req
        );


      const records =
        await MonthlyRewardVerification.find({

          referredTo:
            req.contractorId,

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd

        })
        .populate(
          "referredBy",
          "contractorName mobile"
        )
        .populate(
          "referredTo",
          "contractorName mobile"
        )
        .populate(
          "referralId"
        )
        .sort({
          joiningDate: -1,
          createdAt: -1
        });


      res.json({

        success: true,

        period: {

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          periodLabel:
            period.periodLabel

        },

        records

      });

    }
    catch (error) {

      console.error(
        "RECEIVER REWARD ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to load receiver reward records"

      });

    }

  }
);


/* =====================================================
   RECEIVER STATUS

   PATCH:
   /api/monthly-rewards/:id/receiver-status
===================================================== */

router.patch(
  "/:id/receiver-status",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const record =
        await MonthlyRewardVerification.findById(
          req.params.id
        );


      if (!record) {

        return res.status(404).json({

          success: false,

          message:
            "Monthly reward record not found"

        });

      }


      if (
        String(
          record.referredTo
        ) !==
        String(
          req.contractorId
        )
      ) {

        return res.status(403).json({

          success: false,

          message:
            "Only receiving contractor can verify this worker"

        });

      }


      const status =
        String(
          req.body.status ||
          ""
        ).trim();


      if (
        ![
          "Working",
          "Not Working"
        ].includes(
          status
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Status must be Working or Not Working"

        });

      }


      if (
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Finalized reward cannot be changed"

        });

      }


      record.receiverStatus =
        status;


      record.receiverNote =
        String(
          req.body.note ||
          ""
        ).trim();


      record.receiverConfirmedAt =
        new Date();


      record.finalStatus =
        status;


      record.referrerStatus =
        "Pending";


      record.referrerNote =
        "";

      record.referrerConfirmedAt =
        null;


      record.adminApprovalStatus =
        "Pending";


      await record.save();


      try {

        await notificationRoutes.createNotification(

          record.referredBy,

          "Monthly Worker Verification",

          `Worker ${record.workerName} verification: ${status}`,

          "MonthlyReward",

          record.referralId,

          record.workerMobile

        );

      }
      catch (
        notificationError
      ) {

        console.error(
          "REWARD NOTIFICATION ERROR:",
          notificationError.message
        );

      }


      res.json({

        success: true,

        message:
          "Receiver status updated",

        record

      });

    }
    catch (error) {

      console.error(
        "RECEIVER STATUS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to update receiver status"

      });

    }

  }
);


/* =====================================================
   REFERRER CONTRACTOR

   GET:
   /api/monthly-rewards/referrer
===================================================== */

router.get(
  "/referrer",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const period =
        getPeriodFromRequest(
          req
        );


      const records =
        await MonthlyRewardVerification.find({

          referredBy:
            req.contractorId,

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd

        })
        .populate(
          "referredBy",
          "contractorName mobile"
        )
        .populate(
          "referredTo",
          "contractorName mobile"
        )
        .populate(
          "referralId"
        )
        .sort({
          joiningDate: -1,
          createdAt: -1
        });


      res.json({

        success: true,

        period: {

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          periodLabel:
            period.periodLabel

        },

        records

      });

    }
    catch (error) {

      console.error(
        "REFERRER REWARD ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to load referrer reward records"

      });

    }

  }
);


/* =====================================================
   REFERRER STATUS

   PATCH:
   /api/monthly-rewards/:id/referrer-status
===================================================== */

router.patch(
  "/:id/referrer-status",
  auth,
  async (
    req,
    res
  ) => {

    try {

      const record =
        await MonthlyRewardVerification.findById(
          req.params.id
        );


      if (!record) {

        return res.status(404).json({

          success: false,

          message:
            "Monthly reward record not found"

        });

      }


      if (
        String(
          record.referredBy
        ) !==
        String(
          req.contractorId
        )
      ) {

        return res.status(403).json({

          success: false,

          message:
            "Only referring contractor can verify this worker"

        });

      }


      if (
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Finalized reward cannot be changed"

        });

      }


      const status =
        String(
          req.body.status ||
          ""
        ).trim();


      if (
        ![
          "Confirmed",
          "Disputed"
        ].includes(
          status
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Status must be Confirmed or Disputed"

        });

      }


      record.referrerStatus =
        status;


      record.referrerNote =
        String(
          req.body.note ||
          ""
        ).trim();


      record.referrerConfirmedAt =
        new Date();


      if (
        status ===
        "Disputed"
      ) {

        record.finalStatus =
          "Disputed";

      }
      else {

        if (
          record.receiverStatus ===
          "Working"
        ) {

          record.finalStatus =
            "Verified Working";

        }
        else if (
          record.receiverStatus ===
          "Not Working"
        ) {

          record.finalStatus =
            "Verified Not Working";

        }
        else {

          record.finalStatus =
            "Pending";

        }

      }


      record.adminApprovalStatus =
        "Pending";


      await record.save();


      res.json({

        success: true,

        message:
          "Referrer status updated",

        record

      });

    }
    catch (error) {

      console.error(
        "REFERRER STATUS ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to update referrer status"

      });

    }

  }
);


/* =====================================================
   ADMIN REPORT

   GET:
   /api/monthly-rewards/admin
===================================================== */

router.get(
  "/admin",
  adminAuth,
  async (
    req,
    res
  ) => {

    try {

      const period =
        getPeriodFromRequest(
          req
        );


      const records =
        await MonthlyRewardVerification.find({

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd

        })
        .populate(
          "referredBy",
          "contractorName mobile email"
        )
        .populate(
          "referredTo",
          "contractorName mobile email"
        )
        .populate(
          "verifiedBy",
          "name email"
        )
        .populate(
          "referralId"
        )
        .sort({
          finalStatus: 1,
          joiningDate: -1,
          createdAt: -1
        });


      let grossReward =
        0;

      let adminCommission =
        0;

      let contractorReward =
        0;

      let finalized =
        0;

      let verifiedWorking =
        0;

      let verifiedNotWorking =
        0;

      let disputed =
        0;


      records.forEach(
        record => {

          if (
            record.finalStatus ===
            "Verified Working"
          ) {

            verifiedWorking++;

          }


          if (
            record.finalStatus ===
            "Verified Not Working"
          ) {

            verifiedNotWorking++;

          }


          if (
            record.finalStatus ===
            "Disputed"
          ) {

            disputed++;

          }


          if (
            record.rewardStatus ===
            "Final"
          ) {

            finalized++;

          }


          grossReward +=
            Number(
              record.rewardAmount ||
              0
            );


          adminCommission +=
            Number(
              record.adminCommission ||
              0
            );


          contractorReward +=
            Number(
              record.contractorReward ||
              0
            );

        }
      );


      res.json({

        success: true,

        month:
          req.query.month ||
          indiaDateString(
            period.verificationDate
          ).substring(
            0,
            7
          ),

        period: {

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          periodLabel:
            period.periodLabel

        },

        summary: {

          totalWorkers:
            records.length,

          verifiedWorking,

          verifiedNotWorking,

          disputed,

          finalized,

          grossReward,

          adminCommission,

          contractorReward

        },

        records

      });

    }
    catch (error) {

      console.error(
        "ADMIN REWARD REPORT ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          error.message ||
          "Unable to load admin reward report"

      });

    }

  }
);


/* =====================================================
   ADMIN FINALIZE REWARD

   PATCH:
   /api/monthly-rewards/admin/:id/finalize
===================================================== */

router.patch(
  "/admin/:id/finalize",
  adminAuth,
  async (req, res) => {
    try {

      const reward =
        await MonthlyRewardVerification.findById(
          req.params.id
        );

      if (!reward) {
        return res.status(404).json({
          success: false,
          message: "Reward record not found"
        });
      }

      /* =========================================
         ALREADY FINALIZED
      ========================================= */

      if (
        reward.rewardStatus === "Final" &&
        reward.adminApprovalStatus === "Approved"
      ) {
        return res.json({
          success: true,
          message: "Reward already finalized",
          reward
        });
      }

      /* =========================================
         ONLY VERIFIED WORKING
      ========================================= */

      if (
        reward.finalStatus !==
        "Verified Working"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only Verified Working rewards can be finalized"
        });
      }

      /* =========================================
         RECEIVER CHECK
      ========================================= */

      if (
        reward.receiverStatus !== "Working"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Receiver has not confirmed the worker as Working"
        });
      }

      /* =========================================
         REFERRER CHECK
      ========================================= */

      if (
        reward.referrerStatus !== "Confirmed"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Referrer has not confirmed the reward"
        });
      }

      /* =========================================
         REWARD AMOUNT
      ========================================= */

      const rewardPerWorker =
        Number(
          req.body.rewardPerWorker ||
          reward.rewardPerWorker ||
          process.env.WALLET_REWARD_PER_WORKER ||
          500
        );

      if (
        !Number.isFinite(rewardPerWorker) ||
        rewardPerWorker <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid reward amount"
        });
      }

      /* =========================================
         COMMISSION
      ========================================= */

      const commissionPercent =
        Number(
          reward.adminCommissionPercent ||
          process.env.WALLET_ADMIN_COMMISSION_PERCENT ||
          10
        );

      if (
        !Number.isFinite(commissionPercent) ||
        commissionPercent < 0 ||
        commissionPercent > 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid commission percentage"
        });
      }

      /* =========================================
         CALCULATE
      ========================================= */

      const adminCommission =
        Number(
          (
            rewardPerWorker *
            commissionPercent /
            100
          ).toFixed(2)
        );

      const contractorReward =
        Number(
          (
            rewardPerWorker -
            adminCommission
          ).toFixed(2)
        );

      /* =========================================
         SAVE FINAL REWARD
      ========================================= */

      reward.rewardPerWorker =
        rewardPerWorker;

      reward.rewardAmount =
        rewardPerWorker;

      reward.adminCommissionPercent =
        commissionPercent;

      reward.adminCommission =
        adminCommission;

      reward.contractorReward =
        contractorReward;

      reward.rewardStatus =
        "Final";

      reward.adminApprovalStatus =
        "Approved";

      reward.verifiedBy =
        req.admin?._id ||
        req.admin?.id ||
        req.admin?.adminId ||
        req.adminId ||
        null;

      reward.verifiedAt =
        new Date();

      reward.adminNote =
        String(
          req.body.adminNote ||
          reward.adminNote ||
          ""
        ).trim();

      /* =========================================
         PAYMENT STATE
      ========================================= */

      if (
        reward.paymentStatus !== "Paid"
      ) {
        reward.paymentStatus =
          "Not Started";
      }

      /* =========================================
         WALLET STATE
      ========================================= */

      /*
       * Wallet credit payment successful
       * hone ke baad hoga.
       */

      if (
        reward.walletCreditStatus !==
        "Credited"
      ) {
        reward.walletCreditStatus =
          "Not Started";
      }

      await reward.save();

      return res.json({
        success: true,

        message:
          "Reward finalized successfully",

        reward: {
          id:
            reward._id,

          workerName:
            reward.workerName,

          grossReward:
            reward.rewardAmount,

          adminCommission:
            reward.adminCommission,

          contractorReward:
            reward.contractorReward,

          paymentStatus:
            reward.paymentStatus,

          walletCreditStatus:
            reward.walletCreditStatus,

          adminApprovalStatus:
            reward.adminApprovalStatus
        }
      });

    } catch (error) {

      console.error(
        "FINALIZE REWARD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to finalize reward"
      });
    }
  }
);



/* =====================================================
   ADMIN REJECT

   PATCH:
   /api/monthly-rewards/admin/:id/reject
===================================================== */

router.patch(
  "/admin/:id/reject",
  adminAuth,
  async (
    req,
    res
  ) => {

    try {

      const record =
        await MonthlyRewardVerification.findById(
          req.params.id
        );


      if (!record) {

        return res.status(404).json({

          success: false,

          message:
            "Reward record not found"

        });

      }


      if (
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Finalized reward cannot be rejected"

        });

      }


      record.adminApprovalStatus =
        "Rejected";


      record.adminNote =
        String(
          req.body.note ||
          ""
        ).trim();


      record.rewardStatus =
        "Pending";


      record.rewardAmount =
        0;


      record.adminCommission =
        0;


      record.contractorReward =
        0;


      record.verifiedBy =
        req.adminId;


      record.verifiedAt =
        new Date();


      await record.save();


      try {

        await notificationRoutes.createNotification(

          record.referredBy,

          "Monthly Reward Review",

          `Worker ${record.workerName} reward was rejected by Admin.`,

          "MonthlyReward",

          record.referralId,

          record.workerMobile

        );

      }
      catch (
        notificationError
      ) {

        console.error(
          "REJECT REWARD NOTIFICATION ERROR:",
          notificationError.message
        );

      }


      res.json({

        success: true,

        message:
          "Reward record rejected",

        record

      });

    }
    catch (error) {

      console.error(
        "REJECT REWARD ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to reject reward"

      });

    }

  }
);


/* =====================================================
   ADMIN DISPUTE FINALIZATION

   PATCH:
   /api/monthly-rewards/admin/:id/resolve-dispute

   Body:

   {
      status: "Verified Working"
   }

   OR

   {
      status: "Verified Not Working"
   }
===================================================== */

router.patch(
  "/admin/:id/resolve-dispute",
  adminAuth,
  async (
    req,
    res
  ) => {

    try {

      const record =
        await MonthlyRewardVerification.findById(
          req.params.id
        );


      if (!record) {

        return res.status(404).json({

          success: false,

          message:
            "Reward record not found"

        });

      }


      if (
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Finalized reward cannot be changed"

        });

      }


      const status =
        String(
          req.body.status ||
          ""
        ).trim();


      if (
        ![
          "Verified Working",
          "Verified Not Working"
        ].includes(
          status
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid dispute resolution status"

        });

      }


      record.finalStatus =
        status;


      record.adminApprovalStatus =
        "Approved";


      record.adminNote =
        String(
          req.body.note ||
          ""
        ).trim();


      record.verifiedBy =
        req.adminId;


      record.verifiedAt =
        new Date();


      /*
       * If Admin resolves as Working,
       * Admin still finalizes the reward
       * separately.
       */

      await record.save();


      res.json({

        success: true,

        message:
          "Dispute resolved",

        record

      });

    }
    catch (error) {

      console.error(
        "RESOLVE DISPUTE ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to resolve dispute"

      });

    }

  }
);


/* =====================================================
   ADMIN SUMMARY

   GET:
   /api/monthly-rewards/admin/summary
===================================================== */

router.get(
  "/admin/summary",
  adminAuth,
  async (
    req,
    res
  ) => {

    try {

      const period =
        getPeriodFromRequest(
          req
        );


      const records =
        await MonthlyRewardVerification.find({

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd

        });


      const summary = {

        totalWorkers:
          records.length,

        pending:
          records.filter(
            x =>
              x.finalStatus ===
              "Pending"
          ).length,

        working:
          records.filter(
            x =>
              x.finalStatus ===
              "Working"
          ).length,

        notWorking:
          records.filter(
            x =>
              x.finalStatus ===
              "Not Working"
          ).length,

        disputed:
          records.filter(
            x =>
              x.finalStatus ===
              "Disputed"
          ).length,

        verifiedWorking:
          records.filter(
            x =>
              x.finalStatus ===
              "Verified Working"
          ).length,

        verifiedNotWorking:
          records.filter(
            x =>
              x.finalStatus ===
              "Verified Not Working"
          ).length,

        finalized:
          records.filter(
            x =>
              x.rewardStatus ===
              "Final"
          ).length,

        grossReward:
          records.reduce(
            (
              total,
              x
            ) =>
              total +
              Number(
                x.rewardAmount ||
                0
              ),
            0
          ),

        adminCommission:
          records.reduce(
            (
              total,
              x
            ) =>
              total +
              Number(
                x.adminCommission ||
                0
              ),
            0
          ),

        contractorReward:
          records.reduce(
            (
              total,
              x
            ) =>
              total +
              Number(
                x.contractorReward ||
                0
              ),
            0
          )

      };


      res.json({

        success: true,

        period: {

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          periodLabel:
            period.periodLabel

        },

        summary

      });

    }
    catch (error) {

      console.error(
        "ADMIN REWARD SUMMARY ERROR:",
        error
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to load reward summary"

      });

    }

  }
);


/* =====================================================
   EXPORT
===================================================== */

router.createMonthlyRecords =
  createMonthlyRecords;


router.getRewardPeriod =
  getRewardPeriod;


module.exports =
  router;
