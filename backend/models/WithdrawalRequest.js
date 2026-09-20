const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      index: true
    },

    amount: {
      type: Number,
      required: true,
      min: 1
    },

    paymentMethod: {
      type: String,
      enum: ["UPI", "BANK"],
      required: true
    },

    upiId: {
      type: String,
      default: ""
    },

    accountHolderName: {
      type: String,
      default: ""
    },

    accountNumber: {
      type: String,
      default: ""
    },

    ifsc: {
      type: String,
      default: ""
    },

    bankName: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Processing",
        "Paid",
        "Rejected",
        "Failed"
      ],
      default: "Pending"
    },

    adminNote: {
      type: String,
      default: ""
    },

    processedAt: {
      type: Date,
      default: null
    },

    transactionReference: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.model(
    "WithdrawalRequest",
    schema
  );
