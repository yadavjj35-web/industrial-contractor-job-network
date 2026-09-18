const mongoose = require("mongoose");

const jobStateSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobRequirement",
      required: true
    },

    status: {
      type: String,
      enum: ["Pending", "Open", "Closed"],
      default: "Pending"
    },

    respondedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

const schema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      index: true
    },

    confirmationDate: {
      type: String,
      required: true,
      index: true
    },

    jobs: {
      type: [jobStateSchema],
      default: []
    },

    cycleStatus: {
      type: String,
      enum: [
        "Not Started",
        "Active",
        "Completed"
      ],
      default: "Not Started"
    },

    newJobNotificationSent: {
      type: Boolean,
      default: false
    },

    lastReminderHour: {
      type: Number,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

/*
 * Ek contractor ki ek date ki
 * sirf ek confirmation cycle.
 */
schema.index(
  {
    contractorId: 1,
    confirmationDate: 1
  },
  {
    unique: true
  }
);

module.exports = mongoose.model(
  "DailyJobConfirmation",
  schema
);
