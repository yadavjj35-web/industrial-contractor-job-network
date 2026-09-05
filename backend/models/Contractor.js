const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const schema = new mongoose.Schema({
  contractorName: { type: String, required: true, trim: true },
  ownerName: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  password: { type: String, required: true, select: false },
  industrialArea: { type: String, default: "" },
  city: { type: String, default: "" },
  address: { type: String, default: "" },
  gst: { type: String, default: "" },
  pan: { type: String, default: "" },
  licenseNumber: { type: String, default: "" },
  verificationStatus: { type: String, enum: ["Pending","Approved","Rejected"], default: "Pending" },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

schema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

schema.methods.comparePassword = function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Contractor", schema);
