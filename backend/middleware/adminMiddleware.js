const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success:false, message:"Admin authentication required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ success:false, message:"Admin access required" });

    const admin = await Admin.findById(decoded.adminId);
    if (!admin || !admin.isActive) return res.status(403).json({ success:false, message:"Admin account inactive" });

    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ success:false, message:"Invalid or expired token" });
  }
};
