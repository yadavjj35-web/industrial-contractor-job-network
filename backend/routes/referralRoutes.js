const router = require("express").Router();
const Referral = require("../models/Referral");
const Job = require("../models/JobRequirement");
const Notification = require("../models/Notification");
const auth = require("../middleware/authMiddleware");
const limit = require("../middleware/subscriptionMiddleware");
const increaseUsage = require("../utils/usage");

const normalize = v => String(v||"").replace(/\D/g,"").slice(-10);
const transitions = {
  New:["Viewed","Accepted","Rejected"],
  Viewed:["Accepted","Rejected"],
  Accepted:["Contacted","Rejected"],
  Contacted:["Interview","Rejected"],
  Interview:["Selected","Rejected"],
  Selected:["Joined","Rejected"],
  Joined:[], Rejected:[]
};

router.post("/", auth, limit("referrals"), async (req,res) => {
  try {
    const b=req.body, mobile=normalize(b.workerMobile);
    if(!b.workerName || !/^\d{10}$/.test(mobile) || !b.jobId) return res.status(400).json({success:false,message:"Worker name, valid mobile and job are required"});

    const job=await Job.findById(b.jobId);
    if(!job || job.status==="Closed" || job.workersFilled>=job.workersRequired) return res.status(400).json({success:false,message:"Job is not available"});
    if(String(job.contractorId)===String(req.contractorId)) return res.status(400).json({success:false,message:"You cannot refer to your own job"});

    const exists=await Referral.findOne({workerMobile:mobile,jobId:job._id,referredBy:req.contractorId,status:{$ne:"Rejected"}});
    if(exists) return res.status(409).json({success:false,message:"This worker is already referred to this job"});

    const referral=await Referral.create({
      ...b, workerMobile:mobile, jobId:job._id,
      referredBy:req.contractorId, referredTo:job.contractorId,
      skills:Array.isArray(b.skills)?b.skills:String(b.skills||"").split(",").map(x=>x.trim()).filter(Boolean)
    });
    await Notification.create({
      contractorId:job.contractorId, title:"New Worker Referral",
      message:`A worker has been referred for ${job.jobTitle}`, type:"Referral", referralId:referral._id
    });
    await increaseUsage(req);
    res.status(201).json({success:true,referral});
  } catch { res.status(500).json({success:false,message:"Referral failed"}); }
});

router.get("/sent", auth, async (req,res)=>{
  const referrals=await Referral.find({referredBy:req.contractorId}).populate("jobId","jobTitle companyName").populate("referredTo","contractorName mobile").sort({createdAt:-1});
  res.json({success:true,referrals});
});

router.get("/received", auth, async (req,res)=>{
  const referrals=await Referral.find({referredTo:req.contractorId}).populate("jobId","jobTitle companyName").populate("referredBy","contractorName mobile").sort({createdAt:-1});
  res.json({success:true,referrals});
});

router.patch("/:id/status", auth, async (req,res)=>{
  const referral=await Referral.findById(req.params.id);
  if(!referral) return res.status(404).json({success:false,message:"Referral not found"});
  if(String(referral.referredTo)!==String(req.contractorId)) return res.status(403).json({success:false,message:"Only receiving contractor can update status"});

  const status=req.body.status;
  if(!transitions[referral.status].includes(status)) return res.status(400).json({success:false,message:`Cannot change ${referral.status} to ${status}`});

  if(status==="Joined" && !referral.joinedCounted){
    const job=await Job.findById(referral.jobId);
    if(!job || job.workersFilled>=job.workersRequired) return res.status(400).json({success:false,message:"No vacancy remaining"});
    job.workersFilled+=1;
    await job.save();
    referral.joinedCounted=true;
  }

  referral.status=status;
  if(req.body.notes!==undefined) referral.notes=req.body.notes;
  await referral.save();

  await Notification.create({
    contractorId:referral.referredBy,
    title:"Referral Status Updated",
    message:`Worker ${referral.workerName} status changed to ${status}`,
    type:"Referral", referralId:referral._id
  });

  res.json({success:true,referral});
});

module.exports=router;
