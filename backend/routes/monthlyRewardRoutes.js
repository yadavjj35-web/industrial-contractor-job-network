const router = require("express").Router();
const jwt = require("jsonwebtoken");

const Referral = require("../models/Referral");
const MonthlyRewardVerification = require("../models/MonthlyRewardVerification");

const auth = require("../middleware/authMiddleware");
const notificationRoutes = require("./notificationRoutes");

// ============================================================
// CONFIG
// ============================================================

const REWARD_PER_WORKER_DEFAULT = 50;
const ADMIN_COMMISSION_PERCENT = 10;

// Payment must be completed within 10 days
const PAYMENT_DEADLINE_DAYS = 10;

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

// ============================================================
// INDIA DATE -> UTC
// ============================================================

function istDateUTC(year, month, day) {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    ) -
      5.5 * 60 * 60 * 1000
  );
}

// ============================================================
// ADD INDIA DAYS
// ============================================================

function addIndiaDays(date, days) {
  return new Date(
    date.getTime() +
      days * 24 * 60 * 60 * 1000
  );
}

// ============================================================
// NORMALIZE YEAR MONTH
// ============================================================

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

function getPeriodFromVerificationDate(
  verificationDate
) {
  const p = getIndiaParts(
    verificationDate
  );

  const verificationYear =
    p.year;

  const verificationMonth =
    p.month;

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

  const finalVerificationDate =
    istDateUTC(
      verificationYear,
      verificationMonth,
      15
    );

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

function getRewardPeriod(
  inputDate = new Date()
) {
  const current =
    getIndiaParts(
      inputDate
    );

  let startYear =
    current.year;

  let startMonth =
    current.month;

  if (current.day < 25) {
    const previous =
      normalizeYearMonth(
        startYear,
        startMonth - 1
      );

    startYear =
      previous.year;

    startMonth =
      previous.month;
  }

  const periodStart =
    istDateUTC(
      startYear,
      startMonth,
      25
    );

  const end =
    normalizeYearMonth(
      startYear,
      startMonth + 1
    );

  const periodEnd =
    istDateUTC(
      end.year,
      end.month,
      25
    );

  const verification =
    normalizeYearMonth(
      startYear,
      startMonth + 1
    );

  const verificationDate =
    istDateUTC(
      verification.year,
      verification.month,
      15
    );

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
    `25 ${startMonthName} ${startYear} → 25 ${endMonthName} ${end.year}`;

  return {
    periodStart,
    periodEnd,
    verificationDate,
    label:
      periodLabel
  };
}

// ============================================================
// PERIOD FROM JOINING DATE
// ============================================================

function getPeriodForJoiningDate(
  joiningDate
) {
  if (!joiningDate) {
    return getRewardPeriod();
  }

  const joining =
    getIndiaParts(
      new Date(joiningDate)
    );

  let startYear =
    joining.year;

  let startMonth =
    joining.month;

  if (joining.day < 25) {
    const previous =
      normalizeYearMonth(
        startYear,
        startMonth - 1
      );

    startYear =
      previous.year;

    startMonth =
      previous.month;
  }

  const periodStart =
    istDateUTC(
      startYear,
      startMonth,
      25
    );

  const end =
    normalizeYearMonth(
      startYear,
      startMonth + 1
    );

  const periodEnd =
    istDateUTC(
      end.year,
      end.month,
      25
    );

  const verification =
    normalizeYearMonth(
      startYear,
      startMonth + 1
    );

  const verificationDate =
    istDateUTC(
      verification.year,
      verification.month,
      15
    );

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
    `25 ${startMonthName} ${startYear} → 25 ${endMonthName} ${end.year}`;

  return {
    periodStart,
    periodEnd,
    verificationDate,
    label:
      periodLabel
  };
}

// ============================================================
// REQUEST PERIOD
// ============================================================

function getPeriodFromRequest(req) {
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
        1
      )
    );
  }

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
    // Public Worker reward:
    // referredBy = null
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
// VERIFIED NOT WORKING DELETE SCHEDULER
// ============================================================

function scheduleVerifiedNotWorkingDeletion(
  record
) {
  if (
    record.finalStatus !==
    "Verified Not Working"
  ) {
    return;
  }

  if (record.deleteAt) {
    return;
  }

  record.deleteAt =
    new Date(
      Date.now() +
        60 * 60 * 1000
    );

  console.log(
    "Verified Not Working - deletion scheduled:",
    {
      rewardId:
        String(record._id),

      deleteAt:
        record.deleteAt
    }
  );
}

// ============================================================
// GET REFERRER ID SAFELY
// ============================================================

function getReferrerId(referral) {
  return (
    referral?.referredBy?._id ||
    referral?.referredBy ||
    null
  );
}

// ============================================================
// GET RECEIVER ID SAFELY
// ============================================================

function getReceiverId(referral) {
  return (
    referral?.referredTo?._id ||
    referral?.referredTo ||
    null
  );
}

// ============================================================
// CREATE ONE MONTHLY RECORD
// ============================================================

async function createRecordForReferral(
  referral
) {
  const joiningDate =
    referral.joinedAt ||
    referral.updatedAt ||
    null;

  if (!joiningDate) {
    return {
      created: false,
      existing: false,
      repaired: false
    };
  }

  const period =
    getPeriodForJoiningDate(
      joiningDate
    );

  const referredById =
    getReferrerId(
      referral
    );

  const referredToId =
    getReceiverId(
      referral
    );

  const isPublicReferral =
    !referredById;

  const rewardRecipient =
    isPublicReferral
      ? "Admin"
      : "Contractor";

  // ----------------------------------------------------------
  // FIND SAME REFERRAL + SAME PERIOD
  // ----------------------------------------------------------

  let existingRecord =
    await MonthlyRewardVerification.findOne({
      referralId:
        referral._id,

      periodStart:
        period.periodStart,

      periodEnd:
        period.periodEnd
    });

  if (existingRecord) {
    let changed = false;

    if (
      existingRecord.verificationDate?.getTime() !==
      period.verificationDate.getTime()
    ) {
      existingRecord.verificationDate =
        period.verificationDate;

      changed = true;
    }

    if (
      existingRecord.periodLabel !==
      period.label
    ) {
      existingRecord.periodLabel =
        period.label;

      changed = true;
    }

    if (
      !existingRecord.joiningDate ||
      new Date(
        existingRecord.joiningDate
      ).getTime() !==
        new Date(
          joiningDate
        ).getTime()
    ) {
      existingRecord.joiningDate =
        joiningDate;

      changed = true;
    }

    // --------------------------------------------------------
    // IMPORTANT REPAIR
    // --------------------------------------------------------

    const currentReferredBy =
      existingRecord.referredBy
        ? String(
            existingRecord.referredBy
          )
        : null;

    const newReferredBy =
      referredById
        ? String(referredById)
        : null;

    if (
      currentReferredBy !==
      newReferredBy
    ) {
      existingRecord.referredBy =
        referredById;

      changed = true;
    }

    if (
      existingRecord.rewardRecipient !==
      rewardRecipient
    ) {
      existingRecord.rewardRecipient =
        rewardRecipient;

      changed = true;
    }

    if (
      existingRecord.referredTo &&
      referredToId &&
      String(
        existingRecord.referredTo
      ) !== String(referredToId)
    ) {
      existingRecord.referredTo =
        referredToId;

      changed = true;
    }

    if (changed) {
      await existingRecord.save();
    }

    return {
      created: false,
      existing: true,
      repaired: changed
    };
  }

  // ----------------------------------------------------------
  // SAFETY: OLD RECORD FOR SAME REFERRAL
  // ----------------------------------------------------------

  const anyExistingRecord =
    await MonthlyRewardVerification.findOne({
      referralId:
        referral._id
    }).sort({
      joiningDate: -1
    });

  if (anyExistingRecord) {
    const existingJoining =
      anyExistingRecord.joiningDate
        ? new Date(
            anyExistingRecord.joiningDate
          ).getTime()
        : null;

    const currentJoining =
      new Date(
        joiningDate
      ).getTime();

    if (
      existingJoining ===
      currentJoining
    ) {
      anyExistingRecord.periodStart =
        period.periodStart;

      anyExistingRecord.periodEnd =
        period.periodEnd;

      anyExistingRecord.verificationDate =
        period.verificationDate;

      anyExistingRecord.periodLabel =
        period.label;

      anyExistingRecord.joiningDate =
        joiningDate;

      anyExistingRecord.referredBy =
        referredById;

      anyExistingRecord.referredTo =
        referredToId;

      anyExistingRecord.rewardRecipient =
        rewardRecipient;

      await anyExistingRecord.save();

      return {
        created: false,
        existing: true,
        repaired: true
      };
    }
  }

  // ----------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------

  try {
    await MonthlyRewardVerification.create({
      periodStart:
        period.periodStart,

      periodEnd:
        period.periodEnd,

      verificationDate:
        period.verificationDate,

      periodLabel:
        period.label,

      referralId:
        referral._id,

      referredBy:
        referredById,

      referredTo:
        referredToId,

      rewardRecipient:
        rewardRecipient,

      workerName:
        referral.workerName || "",

      workerMobile:
        referral.workerMobile || "",

      joiningDate:
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

      verifiedBy:
        null,

      verifiedAt:
        null,

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

      walletCreditStatus:
        isPublicReferral
          ? "Not Applicable"
          : "Not Started",

      payoutStatus:
        isPublicReferral
          ? "Not Applicable"
          : "Not Started",

      adminApprovalStatus:
        "Pending",

      adminNote:
        "",

      deleteAt:
        null
    });

    console.log(
      "Monthly reward record created:",
      {
        referralId:
          String(referral._id),

        publicReferral:
          isPublicReferral,

        rewardRecipient,

        referredBy:
          referredById
            ? String(referredById)
            : null,

        referredTo:
          referredToId
            ? String(referredToId)
            : null
      }
    );

    return {
      created: true,
      existing: false,
      repaired: false
    };
  } catch (createError) {
    if (
      createError?.code === 11000
    ) {
      return {
        created: false,
        existing: true,
        repaired: false
      };
    }

    throw createError;
  }
}

// ============================================================
// CREATE MONTHLY RECORDS
// ============================================================

async function createMonthlyRecords(
  verificationDate = new Date()
) {
  const period =
    getPeriodFromVerificationDate(
      verificationDate
    );

  const queryEnd =
    addIndiaDays(
      period.periodEnd,
      1
    );

  const referrals =
    await Referral.find({
      status:
        "Joined",

      $or: [
        {
          joinedAt: {
            $gte:
              period.periodStart,

            $lt:
              queryEnd
          }
        },

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
  let repaired = 0;

  for (
    const referral of referrals
  ) {
    const result =
      await createRecordForReferral(
        referral
      );

    if (result.created) {
      created++;
    }

    if (result.existing) {
      existing++;
    }

    if (result.repaired) {
      repaired++;
    }
  }

  return {
    success: true,

    created,

    existing,

    repaired,

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
// CREATE ALL HISTORICAL REFERRAL RECORDS
// ============================================================

async function createAllReferralRecords() {
  const referrals =
    await Referral.find({
      status:
        "Joined"
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
  let skipped = 0;
  let repaired = 0;

  for (
    const referral of referrals
  ) {
    const joiningDate =
      referral.joinedAt ||
      referral.updatedAt ||
      null;

    if (!joiningDate) {
      skipped++;
      continue;
    }

    const result =
      await createRecordForReferral(
        referral
      );

    if (result.created) {
      created++;
    }

    if (result.existing) {
      existing++;
    }

    if (result.repaired) {
      repaired++;
    }
  }

  return {
    success: true,

    created,

    existing,

    repaired,

    skipped,

    total:
      created + existing
  };
}

// ============================================================
// REPAIR ALL EXISTING RECORD PERIODS
// ============================================================

async function repairAllExistingRecords() {
  const records =
    await MonthlyRewardVerification.find({});

  let repaired = 0;
  let skipped = 0;

  for (
    const record of records
  ) {
    if (!record.joiningDate) {
      skipped++;
      continue;
    }

    const correctPeriod =
      getPeriodForJoiningDate(
        record.joiningDate
      );

    let changed = false;

    if (
      !record.periodStart ||
      new Date(
        record.periodStart
      ).getTime() !==
        correctPeriod.periodStart.getTime()
    ) {
      record.periodStart =
        correctPeriod.periodStart;

      changed = true;
    }

    if (
      !record.periodEnd ||
      new Date(
        record.periodEnd
      ).getTime() !==
        correctPeriod.periodEnd.getTime()
    ) {
      record.periodEnd =
        correctPeriod.periodEnd;

      changed = true;
    }

    if (
      !record.verificationDate ||
      new Date(
        record.verificationDate
      ).getTime() !==
        correctPeriod.verificationDate.getTime()
    ) {
      record.verificationDate =
        correctPeriod.verificationDate;

      changed = true;
    }

    if (
      record.periodLabel !==
      correctPeriod.label
    ) {
      record.periodLabel =
        correctPeriod.label;

      changed = true;
    }

    if (
      !record.rewardRecipient
    ) {
      record.rewardRecipient =
        record.referredBy
          ? "Contractor"
          : "Admin";

      changed = true;
    }

    if (
      !record.referredBy &&
      record.rewardRecipient !==
        "Admin"
    ) {
      record.rewardRecipient =
        "Admin";

      changed = true;
    }

    if (
      record.referredBy &&
      record.rewardRecipient !==
        "Contractor"
    ) {
      record.rewardRecipient =
        "Contractor";

      changed = true;
    }

    if (
      !record.referredBy &&
      record.walletCreditStatus !==
        "Not Applicable"
    ) {
      record.walletCreditStatus =
        "Not Applicable";

      changed = true;
    }

    if (
      !record.referredBy &&
      record.payoutStatus !==
        "Not Applicable"
    ) {
      record.payoutStatus =
        "Not Applicable";

      changed = true;
    }

    if (changed) {
      await record.save();
      repaired++;
    }
  }

  return {
    success: true,
    repaired,
    skipped,
    total:
      records.length
  };
}

// ============================================================
// ADD DISPLAY / WARNING INFORMATION
// ============================================================

function addDisplayInformation(
  record
) {
  const obj =
    record.toObject
      ? record.toObject()
      : record;

  const now =
    new Date();

  const periodEnd =
    obj.periodEnd
      ? new Date(obj.periodEnd)
      : null;

  const periodStart =
    obj.periodStart
      ? new Date(obj.periodStart)
      : null;

  const isPreviousPeriod =
    periodEnd
      ? now >=
        addIndiaDays(
          periodEnd,
          1
        )
      : false;

  const isCurrentPeriod =
    periodStart &&
    periodEnd
      ? now >= periodStart &&
        now <
          addIndiaDays(
            periodEnd,
            1
          )
      : false;

  const isPublicReward =
    !obj.referredBy;

  // ----------------------------------------------------------
  // PUBLIC:
  // receiver only
  //
  // NORMAL:
  // receiver + referrer
  // ----------------------------------------------------------

  let isPending = false;

  if (isPublicReward) {
    isPending =
      obj.finalStatus ===
        "Pending" ||
      obj.receiverStatus ===
        "Pending";
  } else {
    isPending =
      obj.finalStatus ===
        "Pending" ||
      obj.receiverStatus ===
        "Pending" ||
      obj.referrerStatus ===
        "Pending";
  }

  const isVerified =
    obj.finalStatus ===
      "Verified Working" ||
    obj.finalStatus ===
      "Verified Not Working";

  // ==========================================================
  // PAYMENT DEADLINE
  // ==========================================================

  let paymentDueAt =
    null;

  let paymentDaysRemaining =
    null;

  let paymentOverdue =
    false;

  if (
    obj.rewardStatus ===
      "Final" &&
    obj.adminApprovalStatus ===
      "Approved" &&
    obj.paymentStatus !==
      "Paid" &&
    obj.verifiedAt
  ) {
    paymentDueAt =
      addIndiaDays(
        new Date(
          obj.verifiedAt
        ),
        PAYMENT_DEADLINE_DAYS
      );

    const remainingMs =
      paymentDueAt.getTime() -
      now.getTime();

    paymentDaysRemaining =
      Math.ceil(
        remainingMs /
          (24 * 60 * 60 * 1000)
      );

    if (
      remainingMs <= 0
    ) {
      paymentOverdue =
        true;

      paymentDaysRemaining =
        0;
    }
  }

  if (
    obj.paymentStatus ===
    "Paid"
  ) {
    paymentOverdue =
      false;

    paymentDaysRemaining =
      null;
  }

  // ==========================================================
  // PREVIOUS PERIOD WARNING
  // ==========================================================

  let warningAlert =
    null;

  if (
    isPreviousPeriod &&
    isPending
  ) {
    warningAlert =
      "⚠️ पिछले महीने का Pending Verification";
  } else if (
    isPreviousPeriod &&
    isVerified &&
    obj.paymentStatus !==
      "Paid"
  ) {
    if (paymentOverdue) {
      warningAlert =
        "🚨 Reward Payment की 10 दिन की समय-सीमा समाप्त हो गई है।";
    } else {
      warningAlert =
        `⚠️ पुराने महीने का verified reward। Payment ${paymentDaysRemaining} दिन के अंदर complete करें।`;
    }
  } else if (
    isPreviousPeriod &&
    isVerified
  ) {
    warningAlert =
      `⚠️ पुराने महीने का ${obj.finalStatus} Record`;
  } else if (
    isPreviousPeriod
  ) {
    warningAlert =
      "⚠️ पिछले महीने का Record";
  }

  // ==========================================================
  // PAYMENT WARNING
  // ==========================================================

  let paymentWarning =
    null;

  if (
    obj.rewardStatus ===
      "Final" &&
    obj.adminApprovalStatus ===
      "Approved" &&
    obj.paymentStatus !==
      "Paid"
  ) {
    if (paymentOverdue) {
      paymentWarning =
        "🚨 Payment की 10 दिन की deadline समाप्त हो गई है।";
    } else if (
      paymentDaysRemaining !==
      null
    ) {
      paymentWarning =
        `⚠️ Reward payment ${paymentDaysRemaining} दिन के अंदर complete करें।`;
    }
  }

  // ==========================================================
  // RECORD AGE
  // ==========================================================

  const recordAge =
    isPreviousPeriod
      ? "Previous"
      : "Current";

  const displayType =
    isPreviousPeriod
      ? "OLD"
      : "NEW";

  // ==========================================================
  // VERIFICATION DATE STATUS
  // ==========================================================

  let verificationStatus =
    "Upcoming";

  if (
    obj.verificationDate
  ) {
    const verificationDate =
      new Date(
        obj.verificationDate
      );

    if (
      now >=
      verificationDate
    ) {
      verificationStatus =
        "Due";
    } else {
      verificationStatus =
        "Upcoming";
    }
  }

  // ==========================================================
  // SAFE REWARD RECIPIENT
  // ==========================================================

  const rewardRecipientType =
    isPublicReward
      ? "Admin"
      : "Contractor";

  const rewardRecipientName =
    isPublicReward
      ? "Admin"
      : (
          obj.referredBy
            ?.contractorName ||
          "Contractor"
        );

  return {
    ...obj,

    isPublicReward,

    rewardRecipientType,

    rewardRecipientName,

    rewardRecipient:
      obj.rewardRecipient ||
      rewardRecipientType,

    isPreviousPeriod,

    isCurrentPeriod,

    isPending,

    isVerified,

    recordAge,

    displayType,

    warningAlert,

    paymentWarning,

    paymentDueAt,

    paymentDaysRemaining,

    paymentOverdue,

    paymentDeadlineDays:
      PAYMENT_DEADLINE_DAYS,

    verificationStatus,

    displayPeriod:
      obj.periodLabel ||
      "",

    displayJoiningDate:
      obj.joiningDate ||
      null,

    displayVerificationDate:
      obj.verificationDate ||
      null
  };
}

// ============================================================
// ENSURE ALL RECORDS
// ============================================================

async function ensureAllReferralRecords() {
  try {
    await createAllReferralRecords();
  } catch (error) {
    console.error(
      "Ensure all referral records error:",
      error.message
    );
  }
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
// GENERATE ALL HISTORICAL RECORDS - ADMIN
// ============================================================

router.post(
  "/generate-all",
  adminAuth,
  async (req, res) => {
    try {
      const result =
        await createAllReferralRecords();

      return res.json({
        success: true,

        message:
          "All referral monthly records generated successfully",

        ...result
      });
    } catch (error) {
      console.error(
        "Generate all records error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Failed to generate all referral records"
      });
    }
  }
);

// ============================================================
// REPAIR EXISTING RECORD PERIODS - ADMIN
// ============================================================

router.post(
  "/repair-periods",
  adminAuth,
  async (req, res) => {
    try {
      const result =
        await repairAllExistingRecords();

      return res.json({
        success: true,

        message:
          "Existing monthly reward periods repaired successfully",

        ...result
      });
    } catch (error) {
      console.error(
        "Repair reward periods error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Failed to repair monthly reward periods"
      });
    }
  }
);

// ============================================================
// RECEIVER - GET ALL
// ============================================================

router.get(
  "/receiver",
  auth,
  async (req, res) => {
    try {
      await ensureAllReferralRecords();

      const records =
        await MonthlyRewardVerification.find({
          referredTo:
            req.contractorId
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

      const finalRecords =
        records.map(
          addDisplayInformation
        );

      return res.json({
        success: true,

        showAllRecords:
          true,

        total:
          finalRecords.length,

        records:
          finalRecords
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

      const isPublicReward =
        !record.referredBy;

      record.receiverStatus =
        status;

      record.receiverNote =
        note || "";

      record.receiverConfirmedAt =
        new Date();

      record.adminApprovalStatus =
        "Pending";

      // ========================================================
      // WORKING
      // ========================================================

      if (
        status === "Working"
      ) {
        if (isPublicReward) {
          // Public Worker:
          // no referrer verification required

          record.referrerStatus =
            "Confirmed";

          record.referrerNote =
            "Public Worker - Admin Reward";

          record.referrerConfirmedAt =
            new Date();

          record.finalStatus =
            "Verified Working";
        } else {
          // Normal referral:
          // referrer must confirm

          record.referrerStatus =
            "Pending";

          record.referrerNote =
            "";

          record.referrerConfirmedAt =
            null;

          record.finalStatus =
            "Working";
        }

        record.rewardAmount =
          0;

        record.adminCommission =
          0;

        record.contractorReward =
          0;

        record.deleteAt =
          null;
      }

      // ========================================================
      // NOT WORKING
      // ========================================================

      else {
        if (isPublicReward) {
          record.referrerStatus =
            "Confirmed";

          record.referrerNote =
            "Public Worker - Admin Reward";

          record.referrerConfirmedAt =
            new Date();

          record.finalStatus =
            "Verified Not Working";
        } else {
          record.referrerStatus =
            "Pending";

          record.referrerNote =
            "";

          record.referrerConfirmedAt =
            null;

          record.finalStatus =
            "Not Working";
        }

        record.rewardAmount =
          0;

        record.adminCommission =
          0;

        record.contractorReward =
          0;

        if (isPublicReward) {
          scheduleVerifiedNotWorkingDeletion(
            record
          );
        } else {
          record.deleteAt =
            null;
        }
      }

      await record.save();

      // ========================================================
      // NOTIFY REFERRER
      // ========================================================

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
            String(
              record.referralId || ""
            ),

          status
        }
      );

      return res.json({
        success: true,

        message:
          "Worker status updated successfully",

        record:
          addDisplayInformation(
            record
          )
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
// REFERRER - GET ALL
// ============================================================

router.get(
  "/referrer",
  auth,
  async (req, res) => {
    try {
      await ensureAllReferralRecords();

      const records =
        await MonthlyRewardVerification.find({
          referredBy:
            req.contractorId
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

      const finalRecords =
        records.map(
          addDisplayInformation
        );

      return res.json({
        success: true,

        showAllRecords:
          true,

        total:
          finalRecords.length,

        records:
          finalRecords
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

      // --------------------------------------------------------
      // PUBLIC REWARD
      // --------------------------------------------------------

      if (!record.referredBy) {
        return res.status(400).json({
          success: false,

          message:
            "Public Worker reward does not require referrer verification"
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

        record.deleteAt =
          null;
      } else {
        if (
          record.receiverStatus ===
          "Working"
        ) {
          record.finalStatus =
            "Verified Working";

          record.deleteAt =
            null;
        } else if (
          record.receiverStatus ===
          "Not Working"
        ) {
          record.finalStatus =
            "Verified Not Working";

          scheduleVerifiedNotWorkingDeletion(
            record
          );
        } else {
          record.finalStatus =
            "Pending";

          record.deleteAt =
            null;
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
            String(
              record.referralId || ""
            ),

          status
        }
      );

      return res.json({
        success: true,

        message:
          "Referrer status updated successfully",

        record:
          addDisplayInformation(
            record
          )
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
// ADMIN - GET ALL
// ============================================================

router.get(
  "/admin",
  adminAuth,
  async (req, res) => {
    try {
      await ensureAllReferralRecords();

      const records =
        await MonthlyRewardVerification.find({})
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

      const finalRecords =
        records.map(
          addDisplayInformation
        );

      let verifiedWorking = 0;
      let verifiedNotWorking = 0;
      let disputed = 0;
      let finalized = 0;

      let grossReward = 0;
      let adminCommission = 0;
      let contractorReward = 0;

      for (
        const record of finalRecords
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

      return res.json({
        success: true,

        showAllRecords:
          true,

        summary: {
          total:
            finalRecords.length,

          verifiedWorking,

          verifiedNotWorking,

          disputed,

          finalized,

          grossReward,

          adminCommission,

          contractorReward
        },

        records:
          finalRecords
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
        record.rewardStatus ===
          "Final" &&
        record.adminApprovalStatus ===
          "Approved"
      ) {
        return res.json({
          success: true,

          message:
            "Reward is already finalized",

          record:
            addDisplayInformation(
              record
            )
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

      const isPublicReward =
        !record.referredBy;

      let adminCommission = 0;
      let contractorReward = 0;

      // ========================================================
      // PUBLIC WORKER
      // ========================================================

      if (isPublicReward) {
        // Full reward belongs to Admin

        adminCommission =
          rewardPerWorker;

        contractorReward =
          0;

        record.rewardRecipient =
          "Admin";
      }

      // ========================================================
      // NORMAL REFERRAL
      // ========================================================

      else {
        adminCommission =
          Math.round(
            (
              rewardPerWorker *
              commissionPercent
            ) /
              100
          );

        contractorReward =
          rewardPerWorker -
          adminCommission;

        record.rewardRecipient =
          "Contractor";
      }

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

      // ========================================================
      // PUBLIC:
      // NO CONTRACTOR WALLET
      // ========================================================

      if (isPublicReward) {
        record.walletCreditStatus =
          "Not Applicable";

        record.payoutStatus =
          "Not Applicable";
      }

      // ========================================================
      // NORMAL:
      // CONTRACTOR WALLET FLOW REMAINS
      // ========================================================

      else if (
        record.walletCreditStatus !==
        "Credited"
      ) {
        record.walletCreditStatus =
          "Not Started";
      }

      record.deleteAt =
        null;

      await record.save();

      // ========================================================
      // NOTIFY NORMAL REFERRER ONLY
      // ========================================================

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
            String(
              record.referralId || ""
            ),

          rewardAmount:
            String(
              rewardPerWorker
            ),

          contractorReward:
            String(
              contractorReward
            ),

          rewardRecipient:
            isPublicReward
              ? "Admin"
              : "Contractor"
        }
      );

      return res.json({
        success: true,

        message:
          isPublicReward
            ? "Public worker reward finalized for admin successfully"
            : "Monthly reward finalized successfully",

        record:
          addDisplayInformation(
            record
          )
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

      if (
        record.finalStatus !==
        "Verified Not Working"
      ) {
        record.deleteAt =
          null;
      }

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
            String(
              record.referralId || ""
            )
        }
      );

      return res.json({
        success: true,

        message:
          "Monthly reward rejected",

        record:
          addDisplayInformation(
            record
          )
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

      const isPublicReward =
        !record.referredBy;

      record.finalStatus =
        finalStatus;

      if (
        finalStatus ===
        "Verified Working"
      ) {
        record.receiverStatus =
          "Working";

        record.receiverConfirmedAt =
          new Date();

        if (isPublicReward) {
          record.referrerStatus =
            "Confirmed";

          record.referrerNote =
            "Public Worker - Admin Reward";

          record.referrerConfirmedAt =
            new Date();
        }
      } else {
        record.receiverStatus =
          "Not Working";

        record.receiverConfirmedAt =
          new Date();

        if (isPublicReward) {
          record.referrerStatus =
            "Confirmed";

          record.referrerNote =
            "Public Worker - Admin Reward";

          record.referrerConfirmedAt =
            new Date();
        }
      }

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

      if (
        finalStatus ===
        "Verified Not Working"
      ) {
        scheduleVerifiedNotWorkingDeletion(
          record
        );
      } else {
        record.deleteAt =
          null;
      }

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
            String(
              record.referralId || ""
            ),

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
            String(
              record.referralId || ""
            ),

          finalStatus
        }
      );

      return res.json({
        success: true,

        message:
          "Monthly reward dispute resolved",

        record:
          addDisplayInformation(
            record
          )
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
          "Failed to resolve reward dispute"
      });
    }
  }
);

// ============================================================
// ADMIN SUMMARY - ALL RECORDS
// ============================================================

router.get(
  "/admin/summary",
  adminAuth,
  async (req, res) => {
    try {
      await ensureAllReferralRecords();

      const records =
        await MonthlyRewardVerification.find({});

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

      return res.json({
        success: true,

        showAllRecords:
          true,

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

router.createAllReferralRecords =
  createAllReferralRecords;

router.repairAllExistingRecords =
  repairAllExistingRecords;

router.createRecordForReferral =
  createRecordForReferral;

router.getRewardPeriod =
  getRewardPeriod;

router.getPeriodFromVerificationDate =
  getPeriodFromVerificationDate;

router.getPeriodForJoiningDate =
  getPeriodForJoiningDate;

module.exports = router;
