const router = require("express").Router();
const jwt = require("jsonwebtoken");
const Contractor = require("../models/Contractor");
const Subscription = require("../models/Subscription");
const auth = require("../middleware/authMiddleware");

const normalize = v => String(v || "").replace(/\D/g,"").slice(-10);

router.post("/register", async (req,res) => {
  try {
    const data = req.body;
    const mobile = normalize(data.mobile);
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({success:false,message:"Enter valid 10 digit mobile"});
    if (!data.password || data.password.length < 8) return res.status(400).json({success:false,message:"Password must be at least 8 characters"});

    const exists = await Contractor.findOne({ mobile });
    if (exists) return res.status(409).json({success:false,message:"Mobile already registered"});

    const contractor = await Contractor.create({ ...data, mobile });
    await Subscription.create({ contractorId: contractor._id, plan:"Free", price:0 });
    res.status(201).json({success:true,message:"Registration successful. Wait for admin approval."});
  } catch(error) {
    res.status(500).json({success:false,message:"Registration failed"});
  }
});

router.post("/login", async (req,res) => {
  try {
    const mobile = normalize(req.body.mobile);
    const contractor = await Contractor.findOne({mobile}).select("+password");
    if (!contractor || !(await contractor.comparePassword(req.body.password || ""))) {
      return res.status(401).json({success:false,message:"Invalid mobile or password"});
    }
    if (contractor.verificationStatus !== "Approved") return res.status(403).json({success:false,message:"Your account is not approved yet"});
    if (!contractor.isActive) return res.status(403).json({success:false,message:"Account inactive"});

    const token = jwt.sign({contractorId:contractor._id}, process.env.JWT_SECRET, {expiresIn:"30d"});
    res.json({success:true,token,contractor:{
      id:contractor._id, contractorName:contractor.contractorName, ownerName:contractor.ownerName,
      mobile:contractor.mobile, email:contractor.email, industrialArea:contractor.industrialArea, city:contractor.city
    }});
  } catch { res.status(500).json({success:false,message:"Login failed"}); }
});

router.get("/me", auth, async (req,res) => res.json({success:true,contractor:req.contractor}));

router.put("/profile", auth, async (req,res) => {
  const allowed = ["contractorName","ownerName","email","industrialArea","city","address","gst","pan","licenseNumber"];
  allowed.forEach(k => { if (req.body[k] !== undefined) req.contractor[k] = req.body[k]; });
  await req.contractor.save();
  res.json({success:true,message:"Profile updated",contractor:req.contractor});
});

module.exports = router;
