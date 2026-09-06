const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    /* ===============================
       CONTRACTOR
    =============================== */

    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true
    },


    /* ===============================
       COMPANY DETAILS
    =============================== */

    companyName: {
      type: String,
      required: true,
      trim: true
    },

    companyLocation: {
      type: String,
      default: "",
      trim: true
    },

    plantUnit: {
      type: String,
      default: "",
      trim: true
    },


    /* ===============================
       JOB DETAILS
    =============================== */

    jobTitle: {
      type: String,
      required: true,
      trim: true
    },

    department: {
      type: String,
      default: "",
      trim: true
    },

    jobType: {
      type: String,
      default: "Full Time",
      trim: true
    },


    /* ===============================
       QUALIFICATION
    =============================== */

    qualification: {
      type: String,
      default: "",
      trim: true
    },

    trade: {
      type: String,
      default: "",
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

    skills: {
      type: [String],
      default: []
    },


    /* ===============================
       SALARY
    =============================== */

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


    /* ===============================
       OTHER DETAILS
    =============================== */

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


    /* ===============================
       VACANCY STATUS

       Open   = Search में दिखाई देगी
       Closed = Search में नहीं दिखाई देगी
    =============================== */

    status: {
      type: String,
      enum: ["Open", "Closed"],
      default: "Open"
    },


    /* ===============================
       ADMIN CLOSE
    =============================== */

    isClosedByAdmin: {
      type: Boolean,
      default: false
    }
  },

  {
    timestamps: true
  }
);


/* ===================================
   AUTO STATUS CHECK
=================================== */

schema.pre("save", function (next) {

  if (this.isClosedByAdmin) {
    this.status = "Closed";
  }

  next();
});


module.exports = mongoose.model(
  "JobRequirement",
  schema
);
