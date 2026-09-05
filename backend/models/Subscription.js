const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  contractorId: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor", required: true, unique: true },
  plan: { type: String, enum: ["Free","Starter","Professional","Business"], default: "Free" },
  price: { type: Number, default: 0 },
  billingCycle: { type: String, default: "Monthly" },
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  status: { type: String, enum: ["Active","Expired","Cancelled"], default: "Active" },
  autoRenew: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", schema);
