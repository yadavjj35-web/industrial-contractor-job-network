const router = require("express").Router();
const jwt = require("jsonwebtoken");

const Referral = require("../models/Referral");
const MonthlyRewardVerification = require("../models/MonthlyRewardVerification");

const auth = require("../middleware/authMiddleware");
const notificationRoutes = require("./notificationRoutes");

// ============================================================
// CONFIG
// ============================================================

const REWARD_PER_WORKER_DEFAULT = 500;
const ADMIN_COMMISSION_PERCENT = 10;


// ============================================================
// INDIA DATE HELPERS
// ============================================================

function getIndiaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = Number(part.value);
    }
  }

  return {
    year: result.year,
    month: result.month,
    day: result.day
  };
}


function istDateUTC(year, month, day) {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    ) - (5.5 * 60 * 60 * 1000)
  );
}


function addIndiaDays(date, days) {
  return new Date(
    date.getTime() +
    days * 24 * 60 * 60 * 1000
  );
}


function normalizeYearMonth(year, month) {

  while (month > 12) {
    month -= 12;
    year++;
  }

  while (month < 1) {
    month += 12;
    year--;
  }

  return {
    year,
    month
  };
}


// ============================================================
// PERIOD FROM VERIFICATION DATE
// ============================================================
//
// Example:
//
// verificationDate = 15 Oct 2026
//
// Reward period:
//
// 25 Aug 2026
//       ↓
// 25 Sep 2026
//
// ============================================================

function getPeriodFromVerificationDate(
  verificationDate
) {

  const p =
    getIndiaParts(verificationDate);

  const verificationYear =
    p.year;

  const verificationMonth =
    p.month;


  // ----------------------------------------------------------
  // Period END = previous month 25
  // ----------------------------------------------------------

  const endNormalized =
    normalizeYearMonth(
      verificationYear,
      verificationMonth - 1
    );

  const endYear =
    endNormalized.year;

  const endMonth =
    endNormalized.month;


  const periodEnd =
    istDateUTC(
      endYear,
      endMonth,
      25
    );


  // ----------------------------------------------------------
  // Period START = month before period END, 25th
  // ----------------------------------------------------------

  const startNormalized =
    normalizeYearMonth(
      endYear,
      endMonth - 1
    );

  const startYear =
    startNormalized.year;

  const startMonth =
    startNormalized.month;


  const periodStart =
    istDateUTC(
      startYear,
      startMonth,
      25
    );


  // ----------------------------------------------------------
  // Verification date
  // ----------------------------------------------------------

  const finalVerificationDate =
    istDateUTC(
      verificationYear,
      verificationMonth,
      15
    );


  // ----------------------------------------------------------
  // Label
  // ----------------------------------------------------------

  const startMonthName =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        month: "short"
      }
    ).format(periodStart);


  const endMonthName =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        month: "short"
      }
    ).format(periodEnd);


  const periodLabel =
    `25 ${startMonthName} ${startYear} → 25 ${endMonthName} ${endYear}`;


  return {

    periodStart,

    periodEnd,

    verificationDate:
      finalVerificationDate,

    label:
      periodLabel

  };
}


// ============================================================
// CURRENT ACTIVE PERIOD
// ============================================================
//
// Before 25th:
//
// 25 previous month → 25 current month
//
// On / after 25th:
//
// 25 current month → 25 next month
//
// ============================================================

function getRewardPeriod(
  inputDate = new Date()
) {

  const current =
    getIndiaParts(inputDate);


  let verificationYear =
    current.year;


  let verificationMonth =
    current.month +
    (
      current.day >= 25
        ? 2
        : 1
    );


  const normalized =
    normalizeYearMonth(
      verificationYear,
      verificationMonth
    );


  verificationYear =
    normalized.year;

  verificationMonth =
    normalized.month;


  const verificationDate =
    istDateUTC(
      verificationYear,
      verificationMonth,
      15
    );


  return getPeriodFromVerificationDate(
    verificationDate
  );
}


// ============================================================
// REQUEST PERIOD
// ============================================================

function getPeriodFromRequest(req) {

  // ----------------------------------------------------------
  // Explicit verificationDate
  // ----------------------------------------------------------

  if (req.query.verificationDate) {

    const value =
      String(
        req.query.verificationDate
      ).trim();


    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {

      throw new Error(
        "verificationDate must be in YYYY-MM-DD format"
      );
    }


    const [
      year,
      month,
      day
    ] =
      value
        .split("-")
        .map(Number);


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


    return getPeriodFromVerificationDate(
      istDateUTC(
        year,
        month,
        day
      )
    );
  }


  // ----------------------------------------------------------
  // Explicit month
  // ----------------------------------------------------------

  if (req.query.month) {

    const value =
      String(
        req.query.month
      ).trim();


    if (
      !/^\d{4}-\d{2}$/.test(value)
    ) {

      throw new Error(
        "month must be in YYYY-MM format"
      );
    }


    const [
      year,
      month
    ] =
      value
        .split("-")
        .map(Number);


    if (
      month < 1 ||
      month > 12
    ) {

      throw new Error(
        "Invalid month"
      );
    }


    return getPeriodFromVerificationDate(
      istDateUTC(
        year,
        month,
        15
      )
    );
  }


  // ----------------------------------------------------------
  // Current active period
  // ----------------------------------------------------------

  return getRewardPeriod();
}


// ============================================================
// ADMIN AUTH
// ============================================================

function adminAuth(
  req,
  res,
  next
) {

  try {

    const token =
      req.headers.authorization?.startsWith(
        "Bearer "
      )
        ? req.headers.authorization.split(" ")[1]
        : req.headers["x-admin-token"];


    if (!token) {

      return res.status(401).json({

        success: false,

        message:
          "Admin token required"

      });
    }


    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );


    if (
      decoded.role !== "admin" &&
      decoded.isAdmin !== true
    ) {

      return res.status(403).json({

        success: false,

        message:
          "Admin access required"

      });
    }


    req.admin =
      decoded;


    next();

  } catch (error) {

    return res.status(401).json({

      success: false,

      message:
        "Invalid or expired admin token"

    });
  }
}


// ============================================================
// NOTIFICATION HELPER
// ============================================================

async function sendNotification(
  contractorId,
  title,
  body,
  data = {}
) {

  try {

    if (!contractorId) {
      return;
    }


    if (
      notificationRoutes &&
      typeof notificationRoutes.createNotificationAndPush ===
      "function"
    ) {

      await notificationRoutes.createNotificationAndPush({

        contractorId,

        title,

        body,

        data

      });
    }

  } catch (error) {

    console.error(
      "Reward notification error:",
      error.message
    );
  }
}


// ============================================================
// CREATE MONTHLY RECORDS
// ============================================================
//
// IMPORTANT:
//
// verificationDate is converted into the correct
// 25-to-25 reward period.
//
// Example:
//
// 15 Oct 2026
//      ↓
// 25 Aug 2026 → 25 Sep 2026
//
// ============================================================

async function createMonthlyRecords(
  verificationDate = new Date()
) {

  const period =
    getPeriodFromVerificationDate(
      verificationDate
    );


  // ----------------------------------------------------------
  // Include complete period END date
  // ----------------------------------------------------------

  const queryEnd =
    addIndiaDays(
      period.periodEnd,
      1
    );


  // ----------------------------------------------------------
  // Find Joined referrals
  // ----------------------------------------------------------

  const referrals =
    await Referral.find({

      status: "Joined",

      $or: [

        // Normal records
        {
          joinedAt: {

            $gte:
              period.periodStart,

            $lt:
              queryEnd

          }
        },

        // Old records where joinedAt was null
        {
          joinedAt: null,

          updatedAt: {

            $gte:
              period.periodStart,

            $lt:
              queryEnd

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
      );


  let created = 0;

  let existing = 0;


  // ----------------------------------------------------------
  // Process referrals
  // ----------------------------------------------------------

  for (
    const referral of referrals
  ) {

    const joiningDate =
      referral.joinedAt ||
      referral.updatedAt ||
      null;


    if (!joiningDate) {
      continue;
    }


    // --------------------------------------------------------
    // Check duplicate
    // --------------------------------------------------------

    const existingRecord =
      await MonthlyRewardVerification.findOne({

        referralId:
          referral._id,

        periodStart:
          period.periodStart,

        periodEnd:
          period.periodEnd

      });


    if (existingRecord) {

      existing++;

      continue;
    }


    // --------------------------------------------------------
    // Create exact schema-compatible record
    // --------------------------------------------------------

    try {

      await MonthlyRewardVerification.create({

        // ====================================================
        // PERIOD
        // ====================================================

        periodStart:
          period.periodStart,

        periodEnd:
          period.periodEnd,

        verificationDate:
          period.verificationDate,

        periodLabel:
          period.label,


        // ====================================================
        // REFERRAL
        // ====================================================

        referralId:
          referral._id,


        // ====================================================
        // CONTRACTORS
        // ====================================================

        referredBy:
          referral.referredBy?._id ||
          referral.referredBy,

        referredTo:
          referral.referredTo?._id ||
          referral.referredTo,


        // ====================================================
        // WORKER
        // ====================================================

        workerName:
          referral.workerName || "",

        workerMobile:
          referral.workerMobile || "",

        joiningDate:


          referral.joinedAt ||
          referral.updatedAt ||
          null,


        // ====================================================
        // RECEIVER
        // ====================================================

        receiverStatus:
          "Pending",

        receiverNote:
          "",

        receiverConfirmedAt:
          null,


        // ====================================================
        // REFERRER
        // ====================================================

        referrerStatus:
          "Pending",

        referrerNote:
          "",

        referrerConfirmedAt:
          null,


        // ====================================================
        // FINAL STATUS
        // ====================================================

        finalStatus:
          "Pending",


        // ====================================================
        // ADMIN
        // ====================================================

        verifiedBy:
          null,

        verifiedAt:
          null,


        // ====================================================
        // REWARD
        // ====================================================

        rewardPerWorker:
          REWARD_PER_WORKER_DEFAULT,

        rewardAmount:
          0,

        rewardStatus:
          "Pending",


        // ====================================================
        // COMMISSION
        // ====================================================

        adminCommissionPercent:
          ADMIN_COMMISSION_PERCENT,

        adminCommission:
          0,


        // ====================================================
        // CONTRACTOR PAYABLE
        // ====================================================

        contractorReward:
          0,


        // ====================================================
        // PAYMENT
        // ====================================================

        paymentStatus:
          "Not Started",


        // ====================================================
        // WALLET
        // ====================================================

        walletCreditStatus:
          "Not Started",


        // ====================================================
        // PAYOUT
        // ====================================================

        payoutStatus:
          "Not Started",


        // ====================================================
        // ADMIN APPROVAL
        // ====================================================

        adminApprovalStatus:
          "Pending",

        adminNote:
          ""

      });


      created++;

    } catch (createError) {

      // ------------------------------------------------------
      // Unique index protection
      //
      // If two requests create the same record simultaneously,
      // MongoDB may return duplicate key error.
      // In that case simply treat it as existing.
      // ------------------------------------------------------

      if (
        createError?.code === 11000
      ) {

        existing++;

        continue;
      }


      throw createError;
    }
  }


  return {

    success: true,

    created,

    existing,

    total:
      created + existing,

    period: {

      start:
        period.periodStart,

      end:
        period.periodEnd,

      verificationDate:
        period.verificationDate,

      label:
        period.label

    }

  };
}


// ============================================================
// ENSURE MONTHLY RECORDS
// ============================================================

async function ensureMonthlyRecords(
  period
) {

  return createMonthlyRecords(
    period.verificationDate
  );
}


// ============================================================
// GENERATE - ADMIN
// ============================================================

router.post(
  "/generate",
  adminAuth,
  async (req, res) => {

    try {

      const period =
        getPeriodFromRequest(req);


      const result =
        await createMonthlyRecords(
          period.verificationDate
        );


      return res.json({

        success: true,

        message:
          "Monthly reward records generated successfully",

        ...result

      });

    } catch (error) {

      console.error(
        "Generate monthly records error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to generate monthly records"

      });
    }
  }
);


// ============================================================
// RECEIVER - GET
// ============================================================

router.get(
  "/receiver",
  auth,
  async (req, res) => {

    try {

      const period =
        getPeriodFromRequest(req);


      // IMPORTANT:
      // Automatically create records before reading them.
      await ensureMonthlyRecords(
        period
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
            joiningDate: -1
          });


      return res.json({

        success: true,

        period: {

          start:
            period.periodStart,

          end:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          label:
            period.label

        },

        records

      });

    } catch (error) {

      console.error(
        "Receiver rewards error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to load receiver rewards"

      });
    }
  }
);


// ============================================================
// RECEIVER STATUS
// ============================================================

router.patch(
  "/:id/receiver-status",
  auth,
  async (req, res) => {

    try {

      const {
        status,
        note
      } = req.body;


      if (
        ![
          "Working",
          "Not Working"
        ].includes(status)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Status must be Working or Not Working"

        });
      }


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
        String(record.referredTo) !==
        String(req.contractorId)
      ) {

        return res.status(403).json({

          success: false,

          message:
            "You are not authorized to update this record"

        });
      }


      if (
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This reward has already been finalized"

        });
      }


      record.receiverStatus =
        status;

      record.receiverNote =
        note || "";

      record.receiverConfirmedAt =
        new Date();


      // Referrer must confirm again
      record.referrerStatus =
        "Pending";

      record.referrerNote =
        "";

      record.referrerConfirmedAt =
        null;


      record.adminApprovalStatus =
        "Pending";


      if (
        status === "Working"
      ) {

        record.finalStatus =
          "Working";

      } else {

        record.finalStatus =
          "Not Working";

        record.rewardAmount =
          0;

        record.adminCommission =
          0;

        record.contractorReward =
          0;
      }


      await record.save();


      await sendNotification(

        record.referredBy,

        "Monthly Reward Verification",

        `${record.workerName} marked as ${status} by receiving contractor.`,

        {

          type:
            "monthly_reward_receiver_status",

          rewardId:
            String(record._id),

          referralId:
            String(record.referralId || ""),

          status

        }

      );


      return res.json({

        success: true,

        message:
          "Worker status updated successfully",

        record

      });

    } catch (error) {

      console.error(
        "Receiver status error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to update receiver status"

      });
    }
  }
);


// ============================================================
// REFERRER - GET
// ============================================================

router.get(
  "/referrer",
  auth,
  async (req, res) => {

    try {

      const period =
        getPeriodFromRequest(req);


      // Automatically create missing records.
      await ensureMonthlyRecords(
        period
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
            joiningDate: -1
          });


      return res.json({

        success: true,

        period: {

          start:
            period.periodStart,

          end:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          label:
            period.label

        },

        records

      });

    } catch (error) {

      console.error(
        "Referrer rewards error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to load referrer rewards"

      });
    }
  }
);


// ============================================================
// REFERRER STATUS
// ============================================================

router.patch(
  "/:id/referrer-status",
  auth,
  async (req, res) => {

    try {

      const {
        status,
        note
      } = req.body;


      if (
        ![
          "Confirmed",
          "Disputed"
        ].includes(status)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Status must be Confirmed or Disputed"

        });
      }


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
        String(record.referredBy) !==
        String(req.contractorId)
      ) {

        return res.status(403).json({

          success: false,

          message:
            "You are not authorized to update this record"

        });
      }


      if (
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This reward has already been finalized"

        });
      }


      record.referrerStatus =
        status;

      record.referrerNote =
        note || "";

      record.referrerConfirmedAt =
        new Date();


      record.adminApprovalStatus =
        "Pending";


      if (
        status === "Disputed"
      ) {

        record.finalStatus =
          "Disputed";

      } else {

        if (
          record.receiverStatus ===
          "Working"
        ) {

          record.finalStatus =
            "Verified Working";

        } else if (
          record.receiverStatus ===
          "Not Working"
        ) {

          record.finalStatus =
            "Verified Not Working";

        } else {

          record.finalStatus =
            "Pending";
        }
      }


      await record.save();


      await sendNotification(

        record.referredTo,

        "Monthly Reward Verification",

        `${record.workerName} has been ${status.toLowerCase()} by the referring contractor.`,

        {

          type:
            "monthly_reward_referrer_status",

          rewardId:
            String(record._id),

          referralId:
            String(record.referralId || ""),

          status

        }

      );


      return res.json({

        success: true,

        message:
          "Referrer status updated successfully",

        record

      });

    } catch (error) {

      console.error(
        "Referrer status error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to update referrer status"

      });
    }
  }
);


// ============================================================
// ADMIN - GET
// ============================================================

router.get(
  "/admin",
  adminAuth,
  async (req, res) => {

    try {

      const period =
        getPeriodFromRequest(req);


      // Automatically create missing records.
      await ensureMonthlyRecords(
        period
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
            "contractorName mobile"
          )
          .populate(
            "referredTo",
            "contractorName mobile"
          )
          .populate(
            "verifiedBy",
            "contractorName mobile"
          )
          .populate(
            "referralId"
          )
          .sort({
            joiningDate: -1
          });


      let verifiedWorking = 0;
      let verifiedNotWorking = 0;
      let disputed = 0;
      let finalized = 0;

      let grossReward = 0;
      let adminCommission = 0;
      let contractorReward = 0;


      for (
        const record of records
      ) {

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
            record.rewardAmount || 0
          );


        adminCommission +=
          Number(
            record.adminCommission || 0
          );


        contractorReward +=
          Number(
            record.contractorReward || 0
          );
      }


      return res.json({

        success: true,

        period: {

          start:
            period.periodStart,

          end:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          label:
            period.label

        },

        summary: {

          total:
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

    } catch (error) {

      console.error(
        "Admin monthly rewards error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to load admin monthly rewards"

      });
    }
  }
);


// ============================================================
// ADMIN - FINALIZE
// ============================================================

router.patch(
  "/admin/:id/finalize",
  adminAuth,
  async (req, res) => {

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
        record.rewardStatus === "Final" &&
        record.adminApprovalStatus === "Approved"
      ) {

        return res.json({

          success: true,

          message:
            "Reward is already finalized",

          record

        });
      }


      if (
        record.finalStatus !==
        "Verified Working"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Only Verified Working records can be finalized"

        });
      }


      if (
        record.receiverStatus !==
        "Working"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Receiver must confirm Working"

        });
      }


      if (
        record.referrerStatus !==
        "Confirmed"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Referrer must confirm the worker"

        });
      }


      const rewardPerWorker =
        Number(
          req.body.rewardPerWorker ||
          record.rewardPerWorker ||
          process.env.REWARD_PER_WORKER ||
          REWARD_PER_WORKER_DEFAULT
        );


      const commissionPercent =
        Number(
          record.adminCommissionPercent ||
          process.env.ADMIN_COMMISSION_PERCENT ||
          ADMIN_COMMISSION_PERCENT
        );


      const adminCommission =
        Math.round(
          rewardPerWorker *
          commissionPercent /
          100
        );


      const contractorReward =
        rewardPerWorker -
        adminCommission;


      record.rewardPerWorker =
        rewardPerWorker;

      record.rewardAmount =
        rewardPerWorker;

      record.adminCommissionPercent =
        commissionPercent;

      record.adminCommission =
        adminCommission;

      record.contractorReward =
        contractorReward;

      record.rewardStatus =
        "Final";

      record.adminApprovalStatus =
        "Approved";

      record.verifiedBy =
        req.admin?._id ||
        req.admin?.id ||
        null;

      record.verifiedAt =
        new Date();

      record.adminNote =
        req.body.adminNote ||
        record.adminNote ||
        "";


      if (
        record.paymentStatus !==
        "Paid"
      ) {

        record.paymentStatus =
          "Not Started";
      }


      if (
        record.walletCreditStatus !==
        "Credited"
      ) {

        record.walletCreditStatus =
          "Not Started";
      }


      await record.save();


      await sendNotification(

        record.referredBy,

        "Monthly Reward Finalized",

        `Reward finalized for ${record.workerName}. Contractor reward: ₹${contractorReward}.`,

        {

          type:
            "monthly_reward_finalized",

          rewardId:
            String(record._id),

          referralId:
            String(record.referralId || ""),

          rewardAmount:
            String(rewardPerWorker),

          contractorReward:
            String(contractorReward)

        }

      );


      return res.json({

        success: true,

        message:
          "Monthly reward finalized successfully",

        record

      });

    } catch (error) {

      console.error(
        "Finalize reward error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to finalize reward"

      });
    }
  }
);


// ============================================================
// ADMIN - REJECT
// ============================================================

router.patch(
  "/admin/:id/reject",
  adminAuth,
  async (req, res) => {

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
        req.body.adminNote ||
        "Rejected by admin";

      record.rewardStatus =
        "Pending";

      record.rewardAmount =
        0;

      record.adminCommission =
        0;

      record.contractorReward =
        0;

      record.verifiedBy =
        req.admin?._id ||
        req.admin?.id ||
        null;

      record.verifiedAt =
        new Date();


      await record.save();


      await sendNotification(

        record.referredBy,

        "Monthly Reward Rejected",

        `Monthly reward for ${record.workerName} was rejected by admin.`,

        {

          type:
            "monthly_reward_rejected",

          rewardId:
            String(record._id),

          referralId:
            String(record.referralId || "")

        }

      );


      return res.json({

        success: true,

        message:
          "Monthly reward rejected",

        record

      });

    } catch (error) {

      console.error(
        "Reject reward error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to reject reward"

      });
    }
  }
);


// ============================================================
// ADMIN - RESOLVE DISPUTE
// ============================================================

router.patch(
  "/admin/:id/resolve",
  adminAuth,
  async (req, res) => {

    try {

      const {
        finalStatus,
        adminNote
      } = req.body;


      if (
        ![
          "Verified Working",
          "Verified Not Working"
        ].includes(finalStatus)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid finalStatus"

        });
      }


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
        record.rewardStatus ===
        "Final"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Finalized reward cannot be changed"

        });
      }


      record.finalStatus =
        finalStatus;

      record.adminApprovalStatus =
        "Approved";

      record.adminNote =
        adminNote || "";

      record.verifiedBy =
        req.admin?._id ||
        req.admin?.id ||
        null;

      record.verifiedAt =
        new Date();


      await record.save();


      await sendNotification(

        record.referredBy,

        "Monthly Reward Dispute Resolved",

        `Admin resolved the reward verification for ${record.workerName}: ${finalStatus}.`,

        {

          type:
            "monthly_reward_dispute_resolved",

          rewardId:
            String(record._id),

          referralId:
            String(record.referralId || ""),

          finalStatus

        }

      );


      await sendNotification(

        record.referredTo,

        "Monthly Reward Dispute Resolved",

        `Admin resolved the reward verification for ${record.workerName}: ${finalStatus}.`,

        {

          type:
            "monthly_reward_dispute_resolved",

          rewardId:
            String(record._id),

          referralId:
            String(record.referralId || ""),

          finalStatus

        }

      );


      return res.json({

        success: true,

        message:
          "Monthly reward dispute resolved",

        record

      });

    } catch (error) {

      console.error(
        "Resolve dispute error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to resolve dispute"

      });
    }
  }
);


// ============================================================
// ADMIN SUMMARY
// ============================================================

router.get(
  "/admin/summary",
  adminAuth,
  async (req, res) => {

    try {

      const period =
        getPeriodFromRequest(req);


      // Automatically create missing records.
      await ensureMonthlyRecords(
        period
      );


      const records =
        await MonthlyRewardVerification.find({

          periodStart:
            period.periodStart,

          periodEnd:
            period.periodEnd

        });


      let total =
        records.length;

      let pending = 0;
      let working = 0;
      let notWorking = 0;
      let disputed = 0;
      let verifiedWorking = 0;
      let verifiedNotWorking = 0;
      let finalized = 0;

      let grossReward = 0;
      let adminCommission = 0;
      let contractorReward = 0;


      for (
        const record of records
      ) {

        if (
          record.finalStatus ===
          "Pending"
        ) {
          pending++;
        }


        if (
          record.finalStatus ===
          "Working"
        ) {
          working++;
        }


        if (
          record.finalStatus ===
          "Not Working"
        ) {
          notWorking++;
        }


        if (
          record.finalStatus ===
          "Disputed"
        ) {
          disputed++;
        }


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
          record.rewardStatus ===
          "Final"
        ) {
          finalized++;
        }


        grossReward +=
          Number(
            record.rewardAmount || 0
          );


        adminCommission +=
          Number(
            record.adminCommission || 0
          );


        contractorReward +=
          Number(
            record.contractorReward || 0
          );
      }


      return res.json({

        success: true,

        period: {

          start:
            period.periodStart,

          end:
            period.periodEnd,

          verificationDate:
            period.verificationDate,

          label:
            period.label

        },

        summary: {

          total,

          pending,

          working,

          notWorking,

          disputed,

          verifiedWorking,

          verifiedNotWorking,

          finalized,

          grossReward,

          adminCommission,

          contractorReward

        }

      });

    } catch (error) {

      console.error(
        "Admin summary error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Failed to load admin summary"

      });
    }
  }
);


// ============================================================
// EXPORT HELPERS
// ============================================================

router.createMonthlyRecords =
  createMonthlyRecords;

router.getRewardPeriod =
  getRewardPeriod;

router.getPeriodFromVerificationDate =
  getPeriodFromVerificationDate;


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;
