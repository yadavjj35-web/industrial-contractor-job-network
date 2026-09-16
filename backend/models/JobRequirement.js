const mongoose = require("mongoose");

const schema = new mongoose.Schema({

  contractorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contractor",
    required: true
  },

  companyName: {
    type: String,
    required: true
  },

  companyLocation: {
    type: String,
    default: ""
  },

  plantUnit: {
    type: String,
    default: ""
  },

  jobTitle: {
    type: String,
    required: true
  },

  department: {
    type: String,
    default: ""
  },

  jobType: {
    type: String,
    default: "Full Time"
  },

  /*
   * Workers Required is optional.
   *
   * null = contractor ne vacancy count specify nahi kiya
   */
  workersRequired: {
    type: Number,
    default: null,
    min: 1
  },

  workersFilled: {
    type: Number,
    default: 0,
    min: 0
  },

  qualification: {
    type: String,
    default: ""
  },

  trade: {
    type: String,
    default: ""
  },

  /*
   * Gender Requirement
   *
   * Any    = koi bhi gender
   * Male   = male worker
   * Female = female worker
   * Other  = other gender
   */
  gender: {
    type: String,
    enum: [
      "Any",
      "Male",
      "Female",
      "Other"
    ],
    default: "Any",
    trim: true
  },

  experienceMin: {
    type: Number,
    default: 0,
    min: 0
  },

  experienceMax: {
    type: Number,
    default: 99,
    min: 0
  },

  skills: [
    {
      type: String
    }
  ],

  salaryMin: {
    type: Number,
    default: 0,
    min: 0
  },

  salaryMax: {
    type: Number,
    default: 0,
    min: 0
  },

  benefits: {
    type: String,
    default: ""
  },

  industrialArea: {
    type: String,
    default: ""
  },

  joiningDate: {
    type: Date
  },

  lastDate: {
    type: Date
  },

  status: {
    type: String,
    enum: [
      "Active",
      "Partially Filled",
      "Closed"
    ],
    default: "Active"
  },

  isClosedByAdmin: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});


/* =========================================================
   WORKERS REMAINING

   Agar Workers Required specify nahi hai,
   to null return hoga.
========================================================= */

schema.virtual("workersRemaining").get(function() {

  if (
    this.workersRequired === null ||
    this.workersRequired === undefined ||
    Number(this.workersRequired) <= 0
  ) {
    return null;
  }

  return Math.max(
    0,
    Number(this.workersRequired) -
    Number(this.workersFilled || 0)
  );

});


/* =========================================================
   JSON / OBJECT VIRTUALS
========================================================= */

schema.set("toJSON", {
  virtuals: true
});

schema.set("toObject", {
  virtuals: true
});


/* =========================================================
   JOB STATUS

   Rules:

   Admin closed
        ↓
      Closed

   Workers Required specified
   AND workers filled >= required
        ↓
      Closed

   Workers Filled > 0
        ↓
   Partially Filled

   Otherwise
        ↓
      Active

   Workers Required blank hone par
   job automatically Closed nahi hogi.
========================================================= */

schema.pre("save", function(next) {

  /*
   * Manually closed by admin
   */
  if (this.isClosedByAdmin) {

    this.status = "Closed";

  }

  /*
   * Vacancy completely filled
   *
   * Sirf tab check hoga jab
   * workersRequired available ho.
   */
  else if (
    this.workersRequired !== null &&
    this.workersRequired !== undefined &&
    Number(this.workersRequired) > 0 &&
    Number(this.workersFilled || 0) >=
      Number(this.workersRequired)
  ) {

    this.status = "Closed";

  }

  /*
   * Some workers already filled
   */
  else if (
    Number(this.workersFilled || 0) > 0
  ) {

    this.status = "Partially Filled";

  }

  /*
   * New / available job
   */
  else {

    this.status = "Active";

  }

  next();

});


module.exports = mongoose.model(
  "JobRequirement",
  schema
);
