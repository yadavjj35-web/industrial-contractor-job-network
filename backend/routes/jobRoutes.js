const router = require("express").Router();
const Job = require("../models/JobRequirement");
const Contractor = require("../models/Contractor");
const auth = require("../middleware/authMiddleware");
const limit = require("../middleware/subscriptionMiddleware");
const increaseUsage = require("../utils/usage");

const splitSkills = v => Array.isArray(v) ? v.map(x=>String(x).trim()).filter(Boolean) : String(v||"").split(",").map(x=>x.trim()).filter(Boolean);

router.post("/", auth, limit("jobRequirements"), async (req,res) => {
  try {
    const b = req.body;
    const workersRequired = Number(b.workersRequired);
    if (!b.companyName || !b.jobTitle || !Number.isInteger(workersRequired) || workersRequired < 1)
      return res.status(400).json({success:false,message:"Company, job title and valid workers required are mandatory"});

    const job = await Job.create({
      ...b,
      contractorId:req.contractorId,
      workersRequired,
      experienceMin:Number(b.experienceMin||0),
      experienceMax:Number(b.experienceMax||99),
      salaryMin:Number(b.salaryMin||0),
      salaryMax:Number(b.salaryMax||0),
      skills:splitSkills(b.skills)
    });
    await increaseUsage(req);
    res.status(201).json({success:true,job});
  } catch { res.status(500).json({success:false,message:"Unable to create job"}); }
});

router.get("/my", auth, async (req,res) => {
  const jobs = await Job.find({contractorId:req.contractorId}).sort({createdAt:-1});
  res.json({success:true,jobs});
});

router.get("/search", auth, limit("workerSearches"), async (req,res) => {
  const { qualification="", trade="", experience=0, preferredJob="", location="", skills="" } = req.query;
  const exp = Number(experience)||0;
  const skillList = splitSkills(skills.map ? skills : skills);
  const jobs = await Job.find({ status:{$in:["Active","Partially Filled"]} }).populate("contractorId","contractorName industrialArea city isActive verificationStatus");

  const results = jobs.filter(job => {
    const c = job.contractorId;
    if (!c || !c.isActive || c.verificationStatus !== "Approved") return false;
    if (String(c._id) === String(req.contractorId)) return false;
    if (job.workersFilled >= job.workersRequired) return false;
    return true;
  }).map(job => {
    let score = 20;
    const text = `${job.jobTitle} ${job.department} ${job.qualification} ${job.trade}`.toLowerCase();
    if (qualification && text.includes(qualification.toLowerCase())) score += 20;
    if (trade && text.includes(trade.toLowerCase())) score += 15;
    if (preferredJob && text.includes(preferredJob.toLowerCase())) score += 20;
    if (location && `${job.companyLocation} ${job.industrialArea}`.toLowerCase().includes(location.toLowerCase())) score += 10;
    if (exp >= job.experienceMin && exp <= job.experienceMax) score += 10;
    const matchedSkills = skillList.filter(s => job.skills.some(js => js.toLowerCase().includes(s.toLowerCase())));
    score += Math.min(25, matchedSkills.length * 8);
    return {...job.toJSON(), matchScore:Math.min(100,score), matchedSkills};
  }).sort((a,b)=>b.matchScore-a.matchScore);

  await increaseUsage(req);
  res.json({success:true,jobs:results});
});

router.get("/:id", auth, async (req,res) => {
  const job = await Job.findById(req.params.id).populate("contractorId","contractorName mobile industrialArea city");
  if (!job) return res.status(404).json({success:false,message:"Job not found"});
  res.json({success:true,job});
});

router.put("/:id", auth, async (req,res) => {
  const job = await Job.findOne({_id:req.params.id, contractorId:req.contractorId});
  if (!job) return res.status(404).json({success:false,message:"Job not found"});
  const allowed = ["companyName","companyLocation","plantUnit","jobTitle","department","jobType","qualification","trade","experienceMin","experienceMax","salaryMin","salaryMax","benefits","industrialArea","joiningDate","lastDate"];
  allowed.forEach(k=>{if(req.body[k]!==undefined) job[k]=req.body[k];});
  if(req.body.skills!==undefined) job.skills=splitSkills(req.body.skills);
  await job.save();
  res.json({success:true,job});
});

router.patch("/:id/close", auth, async (req,res) => {
  const job = await Job.findOne({_id:req.params.id, contractorId:req.contractorId});
  if (!job) return res.status(404).json({success:false,message:"Job not found"});
  job.isClosedByAdmin=true; job.status="Closed"; await job.save();
  res.json({success:true,message:"Job closed"});
});

module.exports = router;
