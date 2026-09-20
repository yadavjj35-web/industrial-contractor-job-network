const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      unique: true,
      index: true
    },

    availableBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    pendingBalance: {
      type: Number,
      default: 0,
      min: 0
    },

    totalEarned: {
      type: Number,
      default: 0,
      min: 0
    },

    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "Wallet",
  schema
);
