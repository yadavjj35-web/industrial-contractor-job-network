const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  contractorId: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: "General" },
  referralId: { type: mongoose.Schema.Types.ObjectId, ref: "Referral" },
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Notification", schema);
