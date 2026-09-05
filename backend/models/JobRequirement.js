const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  contractorId: { type: mongoose.Schema.Types.ObjectId, ref: "Contractor", required: true },
  companyName: { type: String, required: true },
  companyLocation: { type: String, default: "" },
  plantUnit: { type: String, default: "" },
  jobTitle: { type: String, required: true },
  department: { type: String, default: "" },
  jobType: { type: String, default: "Full Time" },
  workersRequired: { type: Number, required: true, min: 1 },
  workersFilled: { type: Number, default: 0 },
  qualification: { type: String, default: "" },
  trade: { type: String, default: "" },
  experienceMin: { type: Number, default: 0 },
  experienceMax: { type: Number, default: 99 },
  skills: [{ type: String }],
  salaryMin: { type: Number, default: 0 },
  salaryMax: { type: Number, default: 0 },
  benefits: { type: String, default: "" },
  industrialArea: { type: String, default: "" },
  joiningDate: Date,
  lastDate: Date,
  status: { type: String, enum: ["Active","Partially Filled","Closed"], default: "Active" },
  isClosedByAdmin: { type: Boolean, default: false }
}, { timestamps: true });

schema.virtual("workersRemaining").get(function() {
  return Math.max(0, this.workersRequired - this.workersFilled);
});
schema.set("toJSON", { virtuals: true });
schema.set("toObject", { virtuals: true });

schema.pre("save", function(next) {
  if (this.isClosedByAdmin || this.workersFilled >= this.workersRequired) {
    this.status = "Closed";
  } else if (this.workersFilled > 0) {
    this.status = "Partially Filled";
  } else {
    this.status = "Active";
  }
  next();
});

module.exports = mongoose.model("JobRequirement", schema);
