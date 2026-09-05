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

router.get("/search", auth, limit("workerSearches"), async (req, res) => {
  try {

    const qualification = String(req.query.qualification || "").trim().toLowerCase();
    const trade = String(req.query.trade || "").trim().toLowerCase();
    const preferredJob = String(req.query.preferredJob || "").trim().toLowerCase();
    const location = String(req.query.location || "").trim().toLowerCase();

    const exp = Number(req.query.experience || 0);

    const skillList = splitSkills(req.query.skills || "")
      .map(s => s.toLowerCase());

    /*
     * IMPORTANT:
     * Har search par database se fresh jobs fetch hongi.
     */
    const jobs = await Job.find({
      status: {
        $in: ["Active", "Partially Filled"]
      }
    })
    .populate(
      "contractorId",
      "contractorName mobile industrialArea city isActive verificationStatus"
    )
    .sort({ createdAt: -1 });


    const results = jobs
      .filter(job => {

        const c = job.contractorId;

        // Contractor exist hona chahiye
        if (!c) return false;

        // Contractor active hona chahiye
        if (!c.isActive) return false;

        // Contractor approved hona chahiye
        if (c.verificationStatus !== "Approved") return false;

        // Vacancy available honi chahiye
        if (
          Number(job.workersFilled || 0) >=
          Number(job.workersRequired || 0)
        ) {
          return false;
        }

        // Apni khud ki job search mein nahi dikhani
        if (
          String(c._id) ===
          String(req.contractorId)
        ) {
          return false;
        }

        return true;
      })


      .map(job => {

        let score = 20;

        const jobText = `
          ${job.jobTitle || ""}
          ${job.department || ""}
          ${job.qualification || ""}
          ${job.trade || ""}
          ${job.companyName || ""}
        `.toLowerCase();


        /*
         * Qualification
         */
        if (
          qualification &&
          jobText.includes(qualification)
        ) {
          score += 20;
        }


        /*
         * Trade
         */
        if (
          trade &&
          jobText.includes(trade)
        ) {
          score += 20;
        }


        /*
         * Preferred Job
         */
        if (
          preferredJob &&
          jobText.includes(preferredJob)
        ) {
          score += 20;
        }


        /*
         * Location
         */
        const jobLocation = `
          ${job.companyLocation || ""}
          ${job.industrialArea || ""}
        `.toLowerCase();

        if (
          location &&
          jobLocation.includes(location)
        ) {
          score += 10;
        }


        /*
         * Experience
         */
        const minExp = Number(job.experienceMin || 0);
router.get("/search", auth, limit("workerSearches"), async (req, res) => {
  try {
    const qualification = String(req.query.qualification || "")
      .trim()
      .toLowerCase();

    const trade = String(req.query.trade || "")
      .trim()
      .toLowerCase();

    const preferredJob = String(req.query.preferredJob || "")
      .trim()
      .toLowerCase();

    const location = String(req.query.location || "")
      .trim()
      .toLowerCase();

    const experience = Number(req.query.experience || 0);

    const workerSkills = splitSkills(req.query.skills || "")
      .map(s => s.toLowerCase());

    const jobs = await Job.find({
      status: { $in: ["Active", "Partially Filled"] }
    })
      .populate(
        "contractorId",
        "contractorName mobile industrialArea city isActive verificationStatus"
      )
      .sort({ createdAt: -1 });

    const results = jobs
      .filter(job => {
        const c = job.contractorId;

        if (!c) return false;

        if (!c.isActive) return false;

        if (c.verificationStatus !== "Approved") return false;

        if (
          Number(job.workersFilled || 0) >=
          Number(job.workersRequired || 0)
        ) {
          return false;
        }

        // Apni khud ki job nahi dikhani
        if (String(c._id) === String(req.contractorId)) {
          return false;
        }

        // Experience eligibility
        const minExp = Number(job.experienceMin || 0);
        const maxExp = Number(job.experienceMax || 99);

        if (experience < minExp || experience > maxExp) {
          return false;
        }

        return true;
      })

      .map(job => {

        let score = 0;

        /* =========================
           QUALIFICATION = 40%
        ========================= */

        const jobQualification =
          String(job.qualification || "")
            .trim()
            .toLowerCase();

        if (
          qualification &&
          jobQualification &&
          jobQualification === qualification
        ) {
          score += 40;
        }


        /* =========================
           TRADE = 30%
        ========================= */

        const jobTrade =
          String(job.trade || "")
            .trim()
            .toLowerCase();

        if (
          trade &&
          jobTrade &&
          jobTrade === trade
        ) {
          score += 30;
        }


        /* =========================
           SKILLS = 20%
        ========================= */

        const jobSkills = splitSkills(job.skills || [])
          .map(s => s.toLowerCase());

        let matchedSkills = [];

        if (workerSkills.length && jobSkills.length) {

          matchedSkills = workerSkills.filter(workerSkill =>
            jobSkills.some(jobSkill =>
              jobSkill === workerSkill ||
              jobSkill.includes(workerSkill) ||
              workerSkill.includes(jobSkill)
            )
          );
        }

        if (matchedSkills.length > 0) {
          score += 20;
        }


        /* =========================
           LOCATION = 10%
        ========================= */

        const jobLocation = `
          ${job.companyLocation || ""}
          ${job.industrialArea || ""}
        `.toLowerCase();

        if (
          location &&
          jobLocation.includes(location)
        ) {
          score += 10;
        }


        /* =========================
           PREFERRED JOB
           OPTIONAL FILTER
        ========================= */

        if (
          preferredJob &&
          !String(job.jobTitle || "")
            .toLowerCase()
            .includes(preferredJob)
        ) {
          return null;
        }


        /* =========================
           MINIMUM MATCH = 61%
        ========================= */

        if (score < 61) {
          return null;
        }


        return {
          ...job.toJSON(),

          matchScore: score,

          matchedSkills,

          workersRemaining:
            Math.max(
              0,
              Number(job.workersRequired || 0) -
              Number(job.workersFilled || 0)
            )
        };
      })

      .filter(Boolean)

      .sort((a, b) =>
        b.matchScore - a.matchScore
      );


    await increaseUsage(req);

    res.json({
      success: true,
      count: results.length,
      jobs: results
    });

  } catch (err) {

    console.error("JOB SEARCH ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Unable to search jobs"
    });
  }
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
