const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  workerName: { type: String, required: true },
  workerMobile: { type: String, required: true },
  qualification: String,
  trade: String,
  experience: Number,
  skills: [{ type: String }],
  preferredJob: String,
  preferredLocation: String,
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobRequirement", required: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor", required: true },
  referredTo: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor", required: true },
  status: {
    type: String,
    enum: ["New","Viewed","Accepted","Contacted","Interview","Selected","Joined","Rejected"],
    default: "New"
  },
  notes: String,
  joinedCounted: { type: Boolean, default: false }
}, { timestamps: true });

schema.index({ workerMobile: 1, jobId: 1, referredBy: 1 });

module.exports = mongoose.model("Referral", schema);
