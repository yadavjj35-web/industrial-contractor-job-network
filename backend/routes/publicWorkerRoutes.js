const router = require("express").Router();

const crypto = require("crypto");

const PublicWorkerRequest =
  require("../models/PublicWorkerRequest");

const Referral =
  require("../models/Referral");

const Job =
  require("../models/JobRequirement");

const Contractor =
  require("../models/Contractor");

const notificationRoutes =
  require("./notificationRoutes");


/* =========================================================
   HELPERS
========================================================= */

const normalizeMobile = value =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-10);


const normalizeText = value =>
  String(value || "")
    .trim()
    .toLowerCase();


const generateTrackingToken = () =>
  crypto.randomBytes(32).toString("hex");


/* =========================================================
   PUBLIC JOB SEARCH
   LOGIN KI ZARURAT NAHI
========================================================= */

router.get(
  "/jobs/search",
  async (req, res) => {

    try {

      const {
        qualification,
        trade,
        location,
        experience,
        preferredJob,
        skills,
        gender
      } = req.query;


      /*
       * Kam se kam ek useful search field
       */

      if (
        !qualification &&
        !trade &&
        !location &&
        !preferredJob &&
        !skills
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Please enter job search details"

        });

      }


      /* =========================================
         ACTIVE JOBS ONLY
      ========================================= */

      const jobs =
        await Job.find({

          status: {
            $in: [
              "Active",
              "Partially Filled"
            ]
          },

          isClosedByAdmin: {
            $ne: true
          }

        })
        .sort({
          createdAt: -1
        })
        .lean();


      const searchQualification =
        normalizeText(
          qualification
        );

      const searchTrade =
        normalizeText(
          trade
        );

      const searchLocation =
        normalizeText(
          location
        );

      const searchPreferredJob =
        normalizeText(
          preferredJob
        );

      const searchSkills =
        String(skills || "")
          .split(",")
          .map(normalizeText)
          .filter(Boolean);


      const searchExperience =
        experience !== undefined &&
        experience !== ""
          ? Number(experience)
          : null;


      const searchGender =
        normalizeText(gender);


      /* =========================================
         FILTER + MATCH SCORE
      ========================================= */

      const results = [];


      for (const job of jobs) {

        /*
         * Contractor check
         */

        const contractor =
          await Contractor.findById(
            job.contractorId
          )
          .select(
            "contractorName mobile isActive verificationStatus"
          )
          .lean();


        if (!contractor) {
          continue;
        }


        if (
          contractor.isActive === false
        ) {
          continue;
        }


        if (
          contractor.verificationStatus &&
          contractor.verificationStatus !==
            "Approved"
        ) {
          continue;
        }


        /*
         * Vacancy
         */

        if (
          job.workersRequired !== null &&
          job.workersRequired !== undefined
        ) {

          const remaining =
            Number(job.workersRequired || 0) -
            Number(job.workersFilled || 0);


          if (remaining <= 0) {
            continue;
          }

        }


        let score = 0;

        const matchDetails = {};


        /* =====================================
           QUALIFICATION
        ===================================== */

        if (searchQualification) {

          const value =
            normalizeText(
              job.qualification
            );

          if (
            value.includes(
              searchQualification
            ) ||
            searchQualification.includes(
              value
            )
          ) {

            score += 25;

            matchDetails.qualification =
              true;

          }

        }


        /* =====================================
           TRADE
        ===================================== */

        if (searchTrade) {

          const value =
            normalizeText(
              job.trade
            );

          if (
            value.includes(searchTrade) ||
            searchTrade.includes(value)
          ) {

            score += 25;

            matchDetails.trade =
              true;

          }

        }


        /* =====================================
           LOCATION
        ===================================== */

        if (searchLocation) {

          const value =
            normalizeText(
              job.companyLocation
            );

          if (
            value.includes(searchLocation) ||
            searchLocation.includes(value)
          ) {

            score += 25;

            matchDetails.location =
              true;

          }

        }


        /* =====================================
           GENDER
        ===================================== */

        if (
          searchGender &&
          job.gender
        ) {

          const value =
            normalizeText(
              job.gender
            );

          if (
            value === searchGender ||
            value === "any" ||
            value === "all"
          ) {

            score += 25;

            matchDetails.gender =
              true;

          }

        }


        /*
         * Agar gender search nahi diya,
         * gender score nahi milega.
         */


        /* =====================================
           EXPERIENCE
        ===================================== */

        if (
          searchExperience !== null &&
          !Number.isNaN(searchExperience)
        ) {

          const min =
            Number(job.experienceMin || 0);

          const max =
            job.experienceMax !== undefined &&
            job.experienceMax !== null
              ? Number(job.experienceMax)
              : null;


          if (
            searchExperience >= min &&
            (
              max === null ||
              searchExperience <= max
            )
          ) {

            matchDetails.experience =
              true;

          } else {

            continue;

          }

        }


        /* =====================================
           PREFERRED JOB
        ===================================== */

        if (searchPreferredJob) {

          const title =
            normalizeText(
              job.jobTitle
            );

          if (
            title.includes(
              searchPreferredJob
            )
          ) {

            matchDetails.preferredJob =
              true;

          }

        }


        /* =====================================
           SKILLS
        ===================================== */

        let matchedSkills = [];


        if (
          searchSkills.length &&
          Array.isArray(job.skills)
        ) {

          matchedSkills =
            job.skills.filter(
              skill =>
                searchSkills.some(
                  wanted =>
                    normalizeText(skill)
                      .includes(wanted) ||
                    wanted.includes(
                      normalizeText(skill)
                    )
                )
            );

          if (matchedSkills.length) {

            matchDetails.skills =
              true;

          }

        }


        /*
         * Search mein kuch matching hona chahiye.
         */

        if (
          score === 0 &&
          !matchDetails.preferredJob &&
          !matchDetails.skills
        ) {
          continue;
        }


        const workersRemaining =
          job.workersRequired !== null &&
          job.workersRequired !== undefined
            ? Math.max(
                0,
                Number(job.workersRequired) -
                Number(job.workersFilled || 0)
              )
            : null;


        /*
         * IMPORTANT:
         * Contractor ka naam/mobile yahan
         * PUBLIC RESPONSE mein nahi bhejna.
         */

        results.push({

          _id:
            job._id,

          companyName:
            job.companyName,

          companyLocation:
            job.companyLocation,

          jobTitle:
            job.jobTitle,

          qualification:
            job.qualification,

          trade:
            job.trade,

          workersRequired:
            job.workersRequired,

          workersFilled:
            job.workersFilled,

          workersRemaining,

          gender:
            job.gender,

          experienceMin:
            job.experienceMin,

          experienceMax:
            job.experienceMax,

          salaryMin:
            job.salaryMin,

          salaryMax:
            job.salaryMax,

          skills:
            job.skills,

          plantUnit:
            job.plantUnit,

          department:
            job.department,

          jobType:
            job.jobType,

          industrialArea:
            job.industrialArea,

          joiningDate:
            job.joiningDate,

          lastDate:
            job.lastDate,

          benefits:
            job.benefits,

          matchScore:
            score,

          matchDetails,

          matchedSkills

        });

      }


      results.sort(
        (a, b) =>
          b.matchScore -
          a.matchScore
      );


      return res.json({

        success: true,

        count:
          results.length,

        jobs:
          results

      });

    }

    catch (error) {

      console.error(
        "PUBLIC JOB SEARCH ERROR:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Unable to search jobs"

      });

    }

  }

);


/* =========================================================
   SUBMIT PUBLIC WORKER REQUEST
========================================================= */

router.post(
  "/apply",
  async (req, res) => {

    try {

      const b =
        req.body;


      const workerMobile =
        normalizeMobile(
          b.workerMobile
        );


      /* =========================================
         VALIDATION
      ========================================= */

      if (
        !b.workerName ||
        !/^\d{10}$/.test(workerMobile) ||
        !b.jobId
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Worker name, valid mobile and job are required"

        });

      }


      /* =========================================
         GET JOB
      ========================================= */

      const job =
        await Job.findById(
          b.jobId
        );


      if (!job) {

        return res.status(404).json({

          success: false,

          message:
            "Job not found"

        });

      }


      if (
        job.status === "Closed" ||
        job.isClosedByAdmin === true
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This job is closed"

        });

      }


      if (
        job.workersRequired !== null &&
        job.workersRequired !== undefined &&
        Number(job.workersFilled || 0) >=
          Number(job.workersRequired)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "No vacancy remaining"

        });

      }


      /* =========================================
         CONTRACTOR
      ========================================= */

      const contractor =
        await Contractor.findById(
          job.contractorId
        )
        .select(
          "contractorName mobile isActive verificationStatus"
        );


      if (!contractor) {

        return res.status(404).json({

          success: false,

          message:
            "Contractor not found"

        });

      }


      if (
        contractor.isActive === false
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This vacancy is currently unavailable"

        });

      }


      if (
        contractor.verificationStatus &&
        contractor.verificationStatus !==
          "Approved"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This vacancy is currently unavailable"

        });

      }


      /* =========================================
         DUPLICATE PUBLIC REQUEST
      ========================================= */

      const existing =
        await PublicWorkerRequest.findOne({

          workerMobile,

          jobId:
            job._id,

          status: {
            $ne:
              "Rejected"
          }

        });


      if (existing) {

        return res.status(409).json({

          success: false,

          message:
            "This worker has already applied for this job",

          trackingToken:
            existing.trackingToken

        });

      }


      /* =========================================
         TRACKING TOKEN
      ========================================= */

      const trackingToken =
        generateTrackingToken();


      const skills =
        Array.isArray(b.skills)
          ? b.skills
          : String(
              b.skills || ""
            )
              .split(",")
              .map(x => x.trim())
              .filter(Boolean);


      /* =========================================
         CREATE PUBLIC REQUEST
      ========================================= */

      const request =
        await PublicWorkerRequest.create({

          workerName:
            String(
              b.workerName
            ).trim(),

          workerMobile,

          qualification:
            b.qualification || "",

          trade:
            b.trade || "",

          experience:
            Number(
              b.experience || 0
            ),

          skills,

          preferredJob:
            b.preferredJob || "",

          preferredLocation:
            b.preferredLocation || "",

          jobId:
            job._id,

          contractorId:
            job.contractorId,

          trackingToken,

          status:
            "Pending",

          adminStatus:
            "Pending",

          contractorStatus:
            "Pending"

        });


      return res.status(201).json({

        success: true,

        message:
          "Application submitted successfully",

        trackingToken,

        status:
          request.status

      });

    }

    catch (error) {

      console.error(
        "PUBLIC WORKER APPLY ERROR:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Unable to submit application"

      });

    }

  }

);


/* =========================================================
   WORKER STATUS
========================================================= */

router.get(
  "/status/:token",
  async (req, res) => {

    try {

      const request =
        await PublicWorkerRequest.findOne({

          trackingToken:
            req.params.token

        })
        .populate(
          "jobId",
          "jobTitle companyName companyLocation"
        )
        .populate(
          "contractorId",
          "contractorName mobile"
        );


      if (!request) {

        return res.status(404).json({

          success: false,

          message:
            "Application not found"

        });

      }


      const response = {

        success: true,

        status:
          request.status,

        workerName:
          request.workerName,

        workerMobile:
          request.workerMobile,

        job:
          request.jobId

      };


      /*
       * Contractor details ONLY after Accepted
       */

      if (
        request.status ===
        "Accepted"
      ) {

        response.contractor = {

          contractorName:
            request.contractorId
              ?.contractorName || "",

          mobile:
            request.contractorId
              ?.mobile || ""

        };

      }


      return res.json(
        response
      );

    }

    catch (error) {

      console.error(
        "PUBLIC WORKER STATUS ERROR:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Unable to load status"

      });

    }

  }

);


module.exports =
  router;
