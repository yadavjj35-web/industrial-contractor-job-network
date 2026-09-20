const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    /* =====================================================
       REWARD PERIOD
       
       Example:
       periodStart = 25 July
       periodEnd   = 25 August
       
       Verification = 15 September
    ===================================================== */

    periodStart: {
      type: Date,
      required: true,
      index: true
    },

    periodEnd: {
      type: Date,
      required: true,
      index: true
    },

    verificationDate: {
      type: Date,
      required: true,
      index: true
    },

    /* =====================================================
       PERIOD LABEL
       
       Example:
       "25 Jul 2026 - 25 Aug 2026"
    ===================================================== */

    periodLabel: {
      type: String,
      required: true,
      trim: true
    },

    /* =====================================================
       ORIGINAL REFERRAL
    ===================================================== */

    referralId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Referral",
      required: true,
      index: true
    },

    /* =====================================================
       CONTRACTORS
    ===================================================== */

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      index: true
    },

    referredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      index: true
    },

    /* =====================================================
       WORKER
    ===================================================== */

    workerName: {
      type: String,
      required: true,
      trim: true
    },

    workerMobile: {
      type: String,
      required: true,
      trim: true
    },

    joiningDate: {
      type: Date,
      default: null
    },

    /* =====================================================
       RECEIVING CONTRACTOR VERIFICATION
    ===================================================== */

    receiverStatus: {
      type: String,

      enum: [
        "Pending",
        "Working",
        "Not Working"
      ],

      default: "Pending"
    },

    receiverNote: {
      type: String,
      default: ""
    },

    receiverConfirmedAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       REFERRING CONTRACTOR VERIFICATION
    ===================================================== */

    referrerStatus: {
      type: String,

      enum: [
        "Pending",
        "Confirmed",
        "Disputed"
      ],

      default: "Pending"
    },

    referrerNote: {
      type: String,
      default: ""
    },

    referrerConfirmedAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       FINAL STATUS
    ===================================================== */

    finalStatus: {
      type: String,

      enum: [
        "Pending",
        "Working",
        "Not Working",
        "Disputed",
        "Verified Working",
        "Verified Not Working"
      ],

      default: "Pending"
    },

    /* =====================================================
       ADMIN VERIFICATION
    ===================================================== */

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },

    verifiedAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       REWARD
    ===================================================== */

    rewardPerWorker: {
      type: Number,
      default: 0,
      min: 0
    },

    rewardAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    rewardStatus: {
      type: String,

      enum: [
        "Pending",
        "Final"
      ],

      default: "Pending"
    },

    /* =====================================================
       ADMIN COMMISSION
    ===================================================== */

    adminCommissionPercent: {
      type: Number,
      default: 10,
      min: 0,
      max: 100
    },

    adminCommission: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =====================================================
       REFERRING CONTRACTOR PAYABLE
    ===================================================== */

    contractorReward: {
      type: Number,
      default: 0,
      min: 0
    },

    /* =====================================================
       PAYMENT
       
       Payment integration will be added later.
    ===================================================== */

    paymentStatus: {
      type: String,

      enum: [
        "Not Started",
        "Pending",
        "Paid"
      ],

      default: "Not Started"
    },

    paidAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       ADMIN APPROVAL
    ===================================================== */

    adminApprovalStatus: {
      type: String,

      enum: [
        "Pending",
        "Approved",
        "Rejected"
      ],

      default: "Pending"
    },

    adminNote: {
      type: String,
      default: ""
    }
  },

  {
    timestamps: true
  }
);


/* =========================================================
   IMPORTANT

   One referral can appear only once
   inside one 25-to-25 reward period.
========================================================= */

schema.index(
  {
    referralId: 1,
    periodStart: 1,
    periodEnd: 1
  },
  {
    unique: true
  }
);


/* =========================================================
   ADMIN REPORT INDEX
========================================================= */

schema.index({
  verificationDate: 1,
  referredBy: 1,
  referredTo: 1
});


module.exports =
  mongoose.model(
    "MonthlyRewardVerification",
    schema
  );
