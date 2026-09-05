const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  contractorId: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor", required: true },
  month: { type: String, required: true },
  jobRequirements: { type: Number, default: 0 },
  workerSearches: { type: Number, default: 0 },
  referrals: { type: Number, default: 0 }
}, { timestamps: true });

schema.index({ contractorId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("SubscriptionUsage", schema);
