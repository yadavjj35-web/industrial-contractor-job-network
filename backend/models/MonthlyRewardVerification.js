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
       RAZORPAY PAYMENT

       Receiving contractor pays ContractorHub.
    ===================================================== */

    paymentOrderId: {
      type: String,
      default: null,
      index: true
    },

    paymentId: {
      type: String,
      default: null,
      index: true
    },

    paymentAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    paymentCurrency: {
      type: String,
      default: "INR"
    },

    paymentStatus: {
      type: String,

      enum: [
        "Not Started",
        "Pending",
        "Paid",
        "Failed"
      ],

      default: "Not Started"
    },

    paymentFailureReason: {
      type: String,
      default: ""
    },

    paidAt: {
      type: Date,
      default: null
    },

    /* =====================================================
       WALLET CREDIT

       After successful payment:

       Gross Reward
            ↓
       Admin Commission
            ↓
       Contractor Reward
            ↓
       Referrer Wallet
    ===================================================== */

    walletCreditStatus: {
      type: String,

      enum: [
        "Not Started",
        "Pending",
        "Credited",
        "Failed"
      ],

      default: "Not Started"
    },

    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null
    },

    walletCreditedAt: {
      type: Date,
      default: null
    },

    walletCreditFailureReason: {
      type: String,
      default: ""
    },

    /* =====================================================
       WITHDRAWAL / PAYOUT

       Wallet se contractor withdraw karega.
    ===================================================== */

    payoutStatus: {
      type: String,

      enum: [
        "Not Started",
        "Pending",
        "Processing",
        "Paid",
        "Failed"
      ],

      default: "Not Started"
    },

    payoutId: {
      type: String,
      default: null,
      index: true
    },

    payoutAmount: {
      type: Number,
      default: 0,
      min: 0
    },

    payoutAt: {
      type: Date,
      default: null
    },

    payoutFailureReason: {
      type: String,
      default: ""
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
    },

    /* =====================================================
       AUTO DELETE

       IMPORTANT:

       Record is deleted ONLY when:

       finalStatus =
       "Verified Not Working"

       At that time backend sets:

       deleteAt = current time + 1 hour

       MongoDB TTL automatically removes the
       record after deleteAt.

       Examples:

       Not Working
       → deleteAt remains null

       Disputed
       → deleteAt remains null

       Verified Working
       → deleteAt remains null

       Verified Not Working
       → deleteAt = now + 1 hour
    ===================================================== */

    deleteAt: {
      type: Date,
      default: null,
      index: true
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


/* =========================================================
   PAYMENT INDEX
========================================================= */

schema.index({
  paymentStatus: 1,
  adminApprovalStatus: 1
});


/* =========================================================
   WALLET INDEX
========================================================= */

schema.index({
  walletCreditStatus: 1,
  referredBy: 1
});


/* =========================================================
   PAYOUT INDEX
========================================================= */

schema.index({
  payoutStatus: 1,
  referredBy: 1
});


/* =========================================================
   AUTO DELETE TTL INDEX
=========================================================

   MongoDB checks deleteAt and automatically deletes
   the document when the deleteAt time is reached.

   expireAfterSeconds: 0 means:

   Delete when deleteAt <= current time.

   IMPORTANT:
   MongoDB TTL cleanup runs in the background, so deletion
   may happen slightly after the exact scheduled time.
========================================================= */

schema.index(
  {
    deleteAt: 1
  },
  {
    expireAfterSeconds: 0
  }
);


/* =========================================================
   MODEL EXPORT
========================================================= */

module.exports =
  mongoose.model(
    "MonthlyRewardVerification",
    schema
  );
