const router=require("express").Router();
const jwt=require("jsonwebtoken");
const Admin=require("../models/Admin");
const Contractor=require("../models/Contractor");
const Job=require("../models/JobRequirement");
const Referral=require("../models/Referral");
const Subscription=require("../models/Subscription");
const adminAuth=require("../middleware/adminMiddleware");

router.post("/login",async(req,res)=>{
  const admin=await Admin.findOne({email:String(req.body.email||"").toLowerCase()}).select("+password");
  if(!admin || !(await admin.comparePassword(req.body.password||""))) return res.status(401).json({success:false,message:"Invalid credentials"});
  if(!admin.isActive)return res.status(403).json({success:false,message:"Admin inactive"});
  const token=jwt.sign({adminId:admin._id,role:"admin"},process.env.JWT_SECRET,{expiresIn:"30d"});
  res.json({success:true,token,admin:{id:admin._id,name:admin.name,email:admin.email}});
});

router.get("/dashboard",adminAuth,async(req,res)=>{
  const [total,pending,approved,jobs,activeJobs,referrals,joined,subs]=await Promise.all([
    Contractor.countDocuments(), Contractor.countDocuments({verificationStatus:"Pending"}), Contractor.countDocuments({verificationStatus:"Approved"}),
    Job.countDocuments(), Job.countDocuments({status:{$in:["Active","Partially Filled"]}}),
    Referral.countDocuments(), Referral.countDocuments({status:"Joined"}), Subscription.find({status:"Active"})
  ]);
  const revenue=subs.reduce((s,x)=>s+(x.price||0),0);
  res.json({success:true,stats:{total,pending,approved,jobs,activeJobs,referrals,joined,revenue}});
});

router.get("/contractors",adminAuth,async(req,res)=>{
  const contractors=await Contractor.find().select("-password").sort({createdAt:-1});
  res.json({success:true,contractors});
});
router.patch("/contractors/:id",adminAuth,async(req,res)=>{
  const allowed=["verificationStatus","isActive"];
  const update={}; allowed.forEach(k=>{if(req.body[k]!==undefined)update[k]=req.body[k]});
  const contractor=await Contractor.findByIdAndUpdate(req.params.id,update,{new:true}).select("-password");
  if(!contractor)return res.status(404).json({success:false,message:"Contractor not found"});
  res.json({success:true,contractor});
});

router.get("/jobs",adminAuth,async(req,res)=>{
  const jobs=await Job.find().populate("contractorId","contractorName mobile").sort({createdAt:-1});
  res.json({success:true,jobs});
});
router.patch("/jobs/:id/close",adminAuth,async(req,res)=>{
  const job=await Job.findByIdAndUpdate(req.params.id,{status:"Closed",isClosedByAdmin:true},{new:true});
  if(!job)return res.status(404).json({success:false,message:"Job not found"});
  res.json({success:true,job});
});

router.get("/referrals",adminAuth,async(req,res)=>{
  const referrals=await Referral.find().populate("jobId","jobTitle companyName").populate("referredBy","contractorName").populate("referredTo","contractorName").sort({createdAt:-1});
  res.json({success:true,referrals});
});

router.get("/subscriptions",adminAuth,async(req,res)=>{
  const subscriptions=await Subscription.find().populate("contractorId","contractorName mobile");
  res.json({success:true,subscriptions});
});
module.exports=router;
