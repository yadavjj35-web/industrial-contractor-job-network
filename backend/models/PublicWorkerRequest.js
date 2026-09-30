const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
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

    qualification: {
      type: String,
      default: ""
    },

    trade: {
      type: String,
      default: ""
    },

    experience: {
      type: Number,
      default: 0
    },

    skills: {
      type: [String],
      default: []
    },

    preferredJob: {
      type: String,
      default: ""
    },

    preferredLocation: {
      type: String,
      default: ""
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobRequirement",
      required: true
    },

    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true
    },

    referralId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Referral",
      default: null
    },

    /*
     * Worker ko dikhne wala ID nahi hai.
     * Ye sirf secure status tracking ke liye hai.
     */
    trackingToken: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    /*
     * Public worker ko simplified status
     */
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Accepted",
        "Rejected"
      ],
      default: "Pending"
    },

    /*
     * Internal admin status
     */
    adminStatus: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected"
      ],
      default: "Pending"
    },

    /*
     * Contractor ka actual response
     */
    contractorStatus: {
      type: String,
      enum: [
        "Pending",
        "Accepted",
        "Rejected"
      ],
      default: "Pending"
    },

    adminNote: {
      type: String,
      default: ""
    },

    contractorNote: {
      type: String,
      default: ""
    },

    approvedAt: {
      type: Date,
      default: null
    },

    sentToContractorAt: {
      type: Date,
      default: null
    },

    contractorRespondedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

schema.index({
  workerMobile: 1,
  jobId: 1
});

module.exports =
  mongoose.model(
    "PublicWorkerRequest",
    schema
  );
