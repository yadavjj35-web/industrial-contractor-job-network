const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: [
        "Reward",
        "Withdrawal",
        "Refund",
        "Adjustment"
      ],
      required: true
    },

    direction: {
      type: String,
      enum: ["Credit", "Debit"],
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    balanceBefore: {
      type: Number,
      required: true
    },

    balanceAfter: {
      type: Number,
      required: true
    },

    description: {
      type: String,
      default: ""
    },

    referenceId: {
      type: String,
      default: "",
      index: true
    },

    referenceType: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Completed",
        "Failed",
        "Cancelled"
      ],
      default: "Completed"
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

schema.index(
  {
    contractorId: 1,
    referenceId: 1,
    type: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      referenceId: {
        $type: "string"
      },
      referenceId: {
        $ne: ""
      }
    }
  }
);

module.exports =
  mongoose.model(
    "WalletTransaction",
    schema
  );
