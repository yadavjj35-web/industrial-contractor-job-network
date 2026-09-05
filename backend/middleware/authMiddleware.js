const jwt = require("jsonwebtoken");
const Contractor = require("../models/Contractor");

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success:false, message:"Authentication required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const contractor = await Contractor.findById(decoded.contractorId);
    if (!contractor) return res.status(401).json({ success:false, message:"Contractor not found" });
    if (contractor.verificationStatus !== "Approved") return res.status(403).json({ success:false, message:"Contractor is not approved" });
    if (!contractor.isActive) return res.status(403).json({ success:false, message:"Contractor account is inactive" });

    req.contractor = contractor;
    req.contractorId = contractor._id;
    next();
  } catch {
    res.status(401).json({ success:false, message:"Invalid or expired token" });
  }
};
