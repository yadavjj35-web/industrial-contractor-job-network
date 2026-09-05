const router = require("express").Router();

const Job = require("../models/JobRequirement");
const Contractor = require("../models/Contractor");

const auth = require("../middleware/authMiddleware");
const limit = require("../middleware/subscriptionMiddleware");
const increaseUsage = require("../utils/usage");


/* =========================================================
   HELPER FUNCTIONS
========================================================= */

// Comma separated skills ko array mein convert karna
const splitSkills = (v) => {
  return Array.isArray(v)
    ? v
        .map(x => String(x).trim())
        .filter(Boolean)
    : String(v || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
};


// Text normalize
const normalizeText = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};


// Qualification normalize
const normalizeQualification = (value) => {
  let v = normalizeText(value);

  const qualificationMap = {
    "10": "10th",
    "10th": "10th",
    "10 th": "10th",
    "matric": "10th",
    "matriculation": "10th",

    "12": "12th",
    "12th": "12th",
    "12 th": "12th",
    "inter": "12th",
    "intermediate": "12th",

    "iti": "iti",
    "i.t.i": "iti",

    "diploma": "diploma",
    "polytechnic": "diploma",

    "graduate": "graduate",
    "graduation": "graduate",

    "bca": "bca",
    "b.tech": "btech",
    "btech": "btech",
    "be": "be",
    "b.e": "be",

    "mca": "mca",
    "m.tech": "mtech",
    "mtech": "mtech"
  };

  return qualificationMap[v] || v;
};


// Trade normalize
const normalizeTrade = (value) => {
  let v = normalizeText(value);

  const tradeMap = {
    "electrical": "electrical",
    "electrician": "electrical",
    "electrical engineering": "electrical",

    "electronics": "electronics",
    "electronic": "electronics",

    "mechanical": "mechanical",
    "fitter": "fitter",

    "welder": "welder",
    "welding": "welder",

    "plumber": "plumber",
    "plumbing": "plumber",

    "helper": "helper",

    "pcm": "pcm",
    "pcb": "pcb",

    "computer": "computer",
    "computer operator": "computer"
  };

  return tradeMap[v] || v;
};


// Skills normalize
const normalizeSkill = (value) => {
  return normalizeText(value);
};


/* =========================================================
   CREATE JOB
========================================================= */

router.post(
  "/",
  auth,
  limit("jobRequirements"),
  async (req, res) => {

    try {

      const b = req.body;

      const workersRequired = Number(
        b.workersRequired
      );


      if (
        !b.companyName ||
        !b.jobTitle ||
        !Number.isInteger(workersRequired) ||
        workersRequired < 1
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Company, job title and valid workers required are mandatory"
        });

      }


      const job = await Job.create({

        ...b,

        contractorId:
          req.contractorId,

        workersRequired,

        experienceMin:
          Number(b.experienceMin || 0),

        experienceMax:
          Number(b.experienceMax || 99),

        salaryMin:
          Number(b.salaryMin || 0),

        salaryMax:
          Number(b.salaryMax || 0),

        skills:
          splitSkills(b.skills)

      });


      await increaseUsage(req);


      res.status(201).json({
        success: true,
        job
      });


    } catch (err) {

      console.error(
        "CREATE JOB ERROR:",
        err
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to create job"
      });

    }

  }
);


/* =========================================================
   MY JOBS
========================================================= */

router.get(
  "/my",
  auth,
  async (req, res) => {

    try {

      const jobs =
        await Job.find({
          contractorId:
            req.contractorId
        })
        .sort({
          createdAt: -1
        });


      res.json({
        success: true,
        jobs
      });


    } catch (err) {

      console.error(
        "MY JOBS ERROR:",
        err
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load jobs"
      });

    }

  }
);


/* =========================================================
   SEARCH JOB FOR WORKER
=========================================================

   MATCHING SYSTEM

   Qualification = 40%
   Trade         = 30%
   Skills        = 20%
   Location      = 10%

   TOTAL         = 100%

   Minimum Match = 61%

   Experience percentage mein add nahi hoga.
   Experience sirf eligibility condition hai.

========================================================= */

router.get(
  "/search",
  auth,
  limit("workerSearches"),
  async (req, res) => {

    try {

      /* =====================================================
         WORKER SEARCH DATA
      ===================================================== */

      const qualification =
        normalizeQualification(
          req.query.qualification
        );


      const trade =
        normalizeTrade(
          req.query.trade
        );


      const preferredJob =
        normalizeText(
          req.query.preferredJob
        );


      const location =
        normalizeText(
          req.query.location
        );


      const experience =
        Number(
          req.query.experience || 0
        );


      const workerSkills =
        splitSkills(
          req.query.skills || ""
        )
        .map(normalizeSkill);


      /* =====================================================
         FETCH ACTIVE JOBS
      ===================================================== */

      const jobs =
        await Job.find({

          status: {
            $in: [
              "Active",
              "Partially Filled"
            ]
          }

        })
        .populate(
          "contractorId",
          "contractorName mobile industrialArea city isActive verificationStatus"
        )
        .sort({
          createdAt: -1
        });


      /* =====================================================
         FILTER + MATCHING
      ===================================================== */

      const results = jobs

        /* ===================================================
           BASIC ELIGIBILITY
        =================================================== */

        .filter(job => {

          const contractor =
            job.contractorId;


          // Contractor exist
          if (!contractor) {
            return false;
          }


          // Contractor active
          if (!contractor.isActive) {
            return false;
          }


          // Contractor approved
          if (
            contractor.verificationStatus !==
            "Approved"
          ) {
            return false;
          }


          // Vacancy available
          if (
            Number(job.workersFilled || 0) >=
            Number(job.workersRequired || 0)
          ) {
            return false;
          }


          // Apni khud ki job nahi dikhani
          if (
            String(contractor._id) ===
            String(req.contractorId)
          ) {
            return false;
          }


          /* ===============================================
             EXPERIENCE ELIGIBILITY
          =============================================== */

          const minExp =
            Number(
              job.experienceMin || 0
            );


          const maxExp =
            Number(
              job.experienceMax || 99
            );


          if (
            experience < minExp ||
            experience > maxExp
          ) {

            return false;

          }


          return true;

        })


        /* ===================================================
           CALCULATE MATCH SCORE
        =================================================== */

        .map(job => {

          let score = 0;


          /* =================================================
             SCORE BREAKDOWN
          ================================================= */

          let qualificationScore = 0;
          let tradeScore = 0;
          let skillsScore = 0;
          let locationScore = 0;


          /* =================================================
             QUALIFICATION = 40%
          ================================================= */

          const jobQualification =
            normalizeQualification(
              job.qualification
            );


          if (
            qualification &&
            jobQualification &&
            jobQualification ===
              qualification
          ) {

            qualificationScore = 40;

            score += 40;

          }


          /* =================================================
             TRADE = 30%
          ================================================= */

          const jobTrade =
            normalizeTrade(
              job.trade
            );


          if (
            trade &&
            jobTrade &&
            jobTrade === trade
          ) {

            tradeScore = 30;

            score += 30;

          }


          /* =================================================
             SKILLS = 20%
          ================================================= */

          const jobSkills =
            splitSkills(
              job.skills || []
            )
            .map(normalizeSkill);


          let matchedSkills = [];


          if (
            workerSkills.length &&
            jobSkills.length
          ) {

            matchedSkills =
              workerSkills.filter(
                workerSkill => {

                  return jobSkills.some(
                    jobSkill => {

                      return (
                        jobSkill ===
                          workerSkill ||

                        jobSkill.includes(
                          workerSkill
                        ) ||

                        workerSkill.includes(
                          jobSkill
                        )
                      );

                    }
                  );

                }
              );

          }


          if (
            matchedSkills.length > 0
          ) {

            skillsScore = 20;

            score += 20;

          }


          /* =================================================
             LOCATION = 10%
          ================================================= */

          const jobLocation =
            normalizeText(
              [
                job.companyLocation || "",
                job.industrialArea || "",
                job.companyName || ""
              ].join(" ")
            );


          if (
            location &&
            jobLocation.includes(location)
          ) {

            locationScore = 10;

            score += 10;

          }


          /* =================================================
             PREFERRED JOB
             OPTIONAL FILTER

             Ye percentage mein add nahi hoga.
          ================================================= */

          if (
            preferredJob &&
            !normalizeText(
              job.jobTitle
            ).includes(
              preferredJob
            )
          ) {

            return null;

          }


          /* =================================================
             MINIMUM MATCH = 61%
          ================================================= */

          if (score < 61) {

            return null;

          }


          /* =================================================
             WORKERS REMAINING
          ================================================= */

          const workersRemaining =
            Math.max(
              0,

              Number(
                job.workersRequired || 0
              ) -

              Number(
                job.workersFilled || 0
              )
            );


          /* =================================================
             FINAL RESULT
          ================================================= */

          return {

            ...job.toJSON(),


            /* ================================
               FINAL MATCH SCORE
            ================================= */

            matchScore:
              score,


            /* ================================
               SCORE BREAKDOWN
            ================================= */

            scoreBreakdown: {

              qualification:
                qualificationScore,

              trade:
                tradeScore,

              skills:
                skillsScore,

              location:
                locationScore,

              total:
                score

            },


            /* ================================
               MATCHED SKILLS
            ================================= */

            matchedSkills,


            /* ================================
               VACANCIES
            ================================= */

            workersRemaining

          };

        })


        /* ===================================================
           REMOVE NULL RESULTS
        =================================================== */

        .filter(Boolean)


        /* ===================================================
           HIGHEST MATCH FIRST
        =================================================== */

        .sort(
          (a, b) =>
            b.matchScore -
            a.matchScore
        );


      /* =====================================================
         USAGE COUNT
      ===================================================== */

      await increaseUsage(req);


      /* =====================================================
         RESPONSE
      ===================================================== */

      res.json({

        success: true,

        count:
          results.length,

        jobs:
          results

      });


    } catch (err) {

      console.error(
        "JOB SEARCH ERROR:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to search jobs"

      });

    }

  }
);


/* =========================================================
   GET SINGLE JOB
========================================================= */

router.get(
  "/:id",
  auth,
  async (req, res) => {

    try {

      const job =
        await Job.findById(
          req.params.id
        )
        .populate(
          "contractorId",
          "contractorName mobile industrialArea city"
        );


      if (!job) {

        return res.status(404).json({

          success: false,

          message:
            "Job not found"

        });

      }


      res.json({

        success: true,

        job

      });


    } catch (err) {

      console.error(
        "GET JOB ERROR:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to get job"

      });

    }

  }
);


/* =========================================================
   UPDATE JOB
========================================================= */

router.put(
  "/:id",
  auth,
  async (req, res) => {

    try {

      const job =
        await Job.findOne({

          _id:
            req.params.id,

          contractorId:
            req.contractorId

        });


      if (!job) {

        return res.status(404).json({

          success: false,

          message:
            "Job not found"

        });

      }


      const allowed = [

        "companyName",

        "companyLocation",

        "plantUnit",

        "jobTitle",

        "department",

        "jobType",

        "qualification",

        "trade",

        "experienceMin",

        "experienceMax",

        "salaryMin",

        "salaryMax",

        "benefits",

        "industrialArea",

        "joiningDate",

        "lastDate"

      ];


      allowed.forEach(key => {

        if (
          req.body[key] !==
          undefined
        ) {

          job[key] =
            req.body[key];

        }

      });


      /* =====================================================
         UPDATE SKILLS
      ===================================================== */

      if (
        req.body.skills !==
        undefined
      ) {

        job.skills =
          splitSkills(
            req.body.skills
          );

      }


      await job.save();


      res.json({

        success: true,

        job

      });


    } catch (err) {

      console.error(
        "UPDATE JOB ERROR:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to update job"

      });

    }

  }
);


/* =========================================================
   CLOSE JOB
========================================================= */

router.patch(
  "/:id/close",
  auth,
  async (req, res) => {

    try {

      const job =
        await Job.findOne({

          _id:
            req.params.id,

          contractorId:
            req.contractorId

        });


      if (!job) {

        return res.status(404).json({

          success: false,

          message:
            "Job not found"

        });

      }


      job.isClosedByAdmin =
        true;

      job.status =
        "Closed";


      await job.save();


      res.json({

        success: true,

        message:
          "Job closed"

      });


    } catch (err) {

      console.error(
        "CLOSE JOB ERROR:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to close job"

      });

    }

  }
);


/* =========================================================
   EXPORT
========================================================= */

module.exports = router;
