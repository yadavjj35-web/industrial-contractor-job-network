const router = require("express").Router();

const Job = require("../models/JobRequirement");

const auth = require("../middleware/authMiddleware");
const limit = require("../middleware/subscriptionMiddleware");
const increaseUsage = require("../utils/usage");


/* =========================================================
   TEXT NORMALIZATION
========================================================= */

function normalizeText(value) {

  let text = String(value || "")
    .trim()
    .toLowerCase();

  // Common punctuation/separators
  text = text.replace(/[.,/\\()_:;|[\]{}]+/g, " ");

  // Hyphen ko space
  text = text.replace(/-/g, " ");

  // Common qualification variation
  text = text.replace(/\bengineering\b/g, "engineer");

  // "pass" ignore
  text = text.replace(/\bpass\b/g, "");

  // Extra spaces
  text = text.replace(/\s+/g, " ").trim();

  return text;
}


/* =========================================================
   QUALIFICATION
========================================================= */

function normalizeQualification(value) {
  return normalizeText(value);
}


/* =========================================================
   TRADE
========================================================= */

function normalizeTrade(value) {
  return normalizeText(value);
}


/* =========================================================
   SKILL
========================================================= */

function normalizeSkill(value) {
  return normalizeText(value);
}


/* =========================================================
   SKILLS ARRAY
========================================================= */

function splitSkills(value) {

  if (Array.isArray(value)) {

    return value
      .flatMap(item => String(item || "").split(","))
      .map(item => normalizeSkill(item))
      .filter(Boolean);

  }

  return String(value || "")
    .split(",")
    .map(item => normalizeSkill(item))
    .filter(Boolean);
}


/* =========================================================
   LEVENSHTEIN DISTANCE
========================================================= */

function levenshtein(a, b) {

  a = String(a || "");
  b = String(b || "");

  if (a === b) return 0;

  if (!a.length) return b.length;

  if (!b.length) return a.length;


  const matrix = [];


  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }


  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }


  for (let i = 1; i <= b.length; i++) {

    for (let j = 1; j <= a.length; j++) {

      if (
        b.charAt(i - 1) ===
        a.charAt(j - 1)
      ) {

        matrix[i][j] =
          matrix[i - 1][j - 1];

      } else {

        matrix[i][j] =
          Math.min(

            matrix[i - 1][j] + 1,

            matrix[i][j - 1] + 1,

            matrix[i - 1][j - 1] + 1

          );

      }

    }

  }


  return matrix[b.length][a.length];

}


/* =========================================================
   PHONETIC NORMALIZATION

   Example:

   Electrician
   Electrishian

   Sound-based spelling mistakes ko support karega.
========================================================= */

function phoneticKey(value) {

  let text = normalizeText(value)
    .replace(/[^a-z0-9]/g, "");


  if (!text) {
    return "";
  }


  // Sound variations

  text = text.replace(/ph/g, "f");

  text = text.replace(/ght/g, "t");

  text = text.replace(/ck/g, "k");

  text = text.replace(/qu/g, "k");

  text = text.replace(/q/g, "k");

  text = text.replace(/c(?=[eiy])/g, "s");

  text = text.replace(/c/g, "k");

  text = text.replace(/z/g, "s");


  /*
    Common ending sound variations

    electrician
    electrishian
    electrishan
  */

  text = text.replace(
    /(ician|ishian|isian|ishan|sian|shan)$/g,
    "ian"
  );


  // First character preserve

  const first = text.charAt(0);


  // Remaining vowels remove

  const rest =
    text
      .slice(1)
      .replace(/[aeiou]/g, "");


  text = first + rest;


  // Repeated characters remove

  text = text.replace(
    /(.)\1+/g,
    "$1"
  );


  return text;

}


/* =========================================================
   WORD SIMILARITY
========================================================= */

function wordSimilarity(a, b) {

  a = normalizeText(a);
  b = normalizeText(b);


  if (!a || !b) {
    return 0;
  }


  if (a === b) {
    return 1;
  }


  // Direct containment

  if (
    a.includes(b) ||
    b.includes(a)
  ) {

    const shortLength =
      Math.min(a.length, b.length);


    const longLength =
      Math.max(a.length, b.length);


    if (shortLength >= 4) {

      return shortLength / longLength;

    }

  }


  const distance =
    levenshtein(a, b);


  const maxLength =
    Math.max(a.length, b.length);


  if (!maxLength) {
    return 0;
  }


  return 1 - (distance / maxLength);

}


/* =========================================================
   FUZZY WORD MATCH
========================================================= */

function fuzzyWordMatch(a, b) {

  a = normalizeText(a);
  b = normalizeText(b);


  if (!a || !b) {
    return false;
  }


  // Exact

  if (a === b) {
    return true;
  }


  // Direct containment

  if (
    a.includes(b) ||
    b.includes(a)
  ) {

    if (
      Math.min(a.length, b.length) >= 4
    ) {
      return true;
    }

  }


  const minLength =
    Math.min(a.length, b.length);


  const maxLength =
    Math.max(a.length, b.length);


  const distance =
    levenshtein(a, b);


  const similarity =
    1 - (distance / maxLength);


  /* -------------------------------------------------------
     SHORT WORDS
  ------------------------------------------------------- */

  if (minLength <= 3) {

    return similarity >= 0.90;

  }


  /* -------------------------------------------------------
     4-5 CHARACTERS
  ------------------------------------------------------- */

  if (minLength <= 5) {

    return (
      distance <= 1 &&
      similarity >= 0.80
    );

  }


  /* -------------------------------------------------------
     6-7 CHARACTERS
  ------------------------------------------------------- */

  if (minLength <= 7) {

    if (
      distance <= 2 &&
      similarity >= 0.72
    ) {
      return true;
    }

  }


  /* -------------------------------------------------------
     8+ CHARACTERS
  ------------------------------------------------------- */

  if (minLength >= 8) {

    let allowedEdits = 2;


    if (minLength >= 12) {
      allowedEdits = 3;
    }


    if (minLength >= 16) {
      allowedEdits = 4;
    }


    if (
      distance <= allowedEdits &&
      similarity >= 0.70
    ) {
      return true;
    }

  }


  /* -------------------------------------------------------
     PHONETIC MATCH
  ------------------------------------------------------- */

  if (minLength >= 6) {

    const keyA = phoneticKey(a);

    const keyB = phoneticKey(b);


    if (
      keyA &&
      keyB &&
      keyA === keyB
    ) {
      return true;
    }

  }


  /* -------------------------------------------------------
     FINAL FALLBACK
  ------------------------------------------------------- */

  if (minLength >= 6) {

    return similarity >= 0.72;

  }


  return false;

}


/* =========================================================
   TEXT TOKENIZATION
========================================================= */

function getWords(value) {

  return normalizeText(value)
    .split(" ")
    .map(word => word.trim())
    .filter(word => word.length > 0);

}


/* =========================================================
   MAIN TEXT MATCHING ENGINE
========================================================= */

function textMatch(workerValue, jobValue) {

  const worker =
    normalizeText(workerValue);


  const job =
    normalizeText(jobValue);


  if (!worker || !job) {
    return false;
  }


  /* -------------------------------------------------------
     EXACT MATCH
  ------------------------------------------------------- */

  if (worker === job) {
    return true;
  }


  /* -------------------------------------------------------
     FULL TEXT CONTAINS
  ------------------------------------------------------- */

  if (
    worker.includes(job) ||
    job.includes(worker)
  ) {
    return true;
  }


  const workerWords =
    getWords(worker);


  const jobWords =
    getWords(job);


  if (
    !workerWords.length ||
    !jobWords.length
  ) {
    return false;
  }


  /* -------------------------------------------------------
     SINGLE WORD MATCH
  ------------------------------------------------------- */

  if (
    workerWords.length === 1 &&
    jobWords.length === 1
  ) {

    return fuzzyWordMatch(
      workerWords[0],
      jobWords[0]
    );

  }


  /* -------------------------------------------------------
     WORKER WORD MATCH COUNT
  ------------------------------------------------------- */

  const workerMatchedCount =
    workerWords.filter(workerWord => {

      return jobWords.some(jobWord =>
        fuzzyWordMatch(
          workerWord,
          jobWord
        )
      );

    }).length;


  /* -------------------------------------------------------
     JOB WORD MATCH COUNT
  ------------------------------------------------------- */

  const jobMatchedCount =
    jobWords.filter(jobWord => {

      return workerWords.some(workerWord =>
        fuzzyWordMatch(
          workerWord,
          jobWord
        )
      );

    }).length;


  const workerCoverage =
    workerMatchedCount /
    workerWords.length;


  const jobCoverage =
    jobMatchedCount /
    jobWords.length;


  /* -------------------------------------------------------
     ONE SIDE SINGLE WORD

     Electrical
     Electrical Engineer
     => MATCH
  ------------------------------------------------------- */

  if (workerWords.length === 1) {

    return (
      workerCoverage === 1
    );

  }


  if (jobWords.length === 1) {

    return (
      jobCoverage === 1
    );

  }


  /* -------------------------------------------------------
     MULTI WORD MAJORITY MATCH
  ------------------------------------------------------- */

  if (
    workerCoverage >= 0.75 &&
    jobCoverage >= 0.75
  ) {
    return true;
  }


  /* -------------------------------------------------------
     WORKER FULL MATCH

     Electrical Engineer

     Senior Electrical Engineer
  ------------------------------------------------------- */

  if (
    workerCoverage === 1 &&
    workerWords.length >= 2
  ) {
    return true;
  }


  /* -------------------------------------------------------
     JOB FULL MATCH
  ------------------------------------------------------- */

  if (
    jobCoverage === 1 &&
    jobWords.length >= 2
  ) {
    return true;
  }


  return false;

}


/* =========================================================
   LOCATION MATCH
========================================================= */

function locationMatch(
  workerLocation,
  jobLocation
) {

  return textMatch(
    workerLocation,
    jobLocation
  );

}


/* =========================================================
   CONTRACTOR LOCATION
========================================================= */

function contractorLocation(contractor) {

  if (!contractor) {
    return "";
  }


  return [

    contractor.industrialArea || "",

    contractor.city || "",

    contractor.location || ""

  ]
    .filter(Boolean)
    .join(" ");

}


/* =========================================================
   EXPERIENCE MATCH SCORE = 20%
========================================================= */

function getExperienceScore(
  workerExperience,
  jobMin,
  jobMax
) {

  const experience =
    Number(workerExperience || 0);


  const min =
    Number(jobMin || 0);


  const max =
    Number(jobMax || 99);


  /*
    Worker required range mein hai
  */

  if (
    experience >= min &&
    experience <= max
  ) {

    return 20;

  }


  return 0;

}


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


      const workersRequired =
        Number(b.workersRequired);


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


      const job =
        await Job.create({

          ...b,

          contractorId:
            req.contractorId,

          workersRequired,

          workersFilled:
            Number(b.workersFilled || 0),

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
   WORKER JOB SEARCH
========================================================= */

router.get(
  "/search",
  auth,
  limit("workerSearches"),

  async (req, res) => {

    try {


      /* =====================================================
         WORKER INPUT
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
          req.query.location ||
          req.query.preferredLocation
        );


      const experience =
        Number(
          req.query.experience || 0
        );


      const workerSkills =
        splitSkills(
          req.query.skills || ""
        );


      /* =====================================================
         VALIDATION
      ===================================================== */

      if (
        !qualification &&
        !trade &&
        !preferredJob &&
        !location &&
        !workerSkills.length
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Please enter at least one search detail"

        });

      }


      if (
        Number.isNaN(experience) ||
        experience < 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid experience value"

        });

      }


      /* =====================================================
         ONLY OPEN JOBS

         CLOSED JOB SEARCH MEIN NAHI AAYEGI
      ===================================================== */

      const jobs =
        await Job.find({

          status: {
            $ne: "Closed"
          },

          isClosedByAdmin: {
            $ne: true
          }

        })
        .populate(
          "contractorId",
          "contractorName mobile industrialArea city location isActive verificationStatus"
        )
        .sort({
          createdAt: -1
        });


      /* =====================================================
         FILTER VALID JOBS
      ===================================================== */

      const eligibleJobs =
        jobs.filter(job => {


          const contractor =
            job.contractorId;


          if (!contractor) {
            return false;
          }


          /* Contractor Active */

          if (
            contractor.isActive === false
          ) {
            return false;
          }


          /* Contractor Approved */

          if (
            contractor.verificationStatus !==
            "Approved"
          ) {
            return false;
          }


          /* Closed Job */

          if (
            job.status === "Closed"
          ) {
            return false;
          }


          if (
            job.isClosedByAdmin === true
          ) {
            return false;
          }


          /* Full Vacancy */

          if (
            Number(job.workersFilled || 0) >=
            Number(job.workersRequired || 0)
          ) {
            return false;
          }


          /* Own Job Hide */

          if (
            String(contractor._id) ===
            String(req.contractorId)
          ) {
            return false;
          }


          /* Preferred Job Filter */

          if (preferredJob) {

            if (
              !job.jobTitle ||
              !textMatch(
                preferredJob,
                job.jobTitle
              )
            ) {
              return false;
            }

          }


          return true;

        });


      /* =====================================================
         SCORE CALCULATION

         Qualification = 30%
         Trade         = 29%
         Skills        = 20%
         Experience    = 20%
         Location      = 1%

         TOTAL = 100%
      ===================================================== */

      const results =
        eligibleJobs

          .map(job => {


            let score = 0;


            let qualificationScore = 0;

            let tradeScore = 0;

            let skillsScore = 0;

            let experienceScore = 0;

            let locationScore = 0;


            /* ================================================
               QUALIFICATION = 30%
            ================================================ */

            if (
              qualification &&
              job.qualification &&
              textMatch(
                qualification,
                job.qualification
              )
            ) {

              qualificationScore = 30;

              score += 30;

            }


            /* ================================================
               TRADE = 29%
            ================================================ */

            if (
              trade &&
              job.trade &&
              textMatch(
                trade,
                job.trade
              )
            ) {

              tradeScore = 29;

              score += 29;

            }


            /* ================================================
               SKILLS = 20%
            ================================================ */

            const jobSkills =
              splitSkills(
                job.skills || []
              );


            const matchedSkills =
              workerSkills.filter(
                workerSkill => {

                  return jobSkills.some(
                    jobSkill =>

                      textMatch(
                        workerSkill,
                        jobSkill
                      )

                  );

                }
              );


            if (
              workerSkills.length > 0 &&
              matchedSkills.length > 0
            ) {

              skillsScore =
                Math.round(

                  (
                    matchedSkills.length /
                    workerSkills.length
                  ) * 20

                );


              skillsScore =
                Math.min(
                  20,
                  skillsScore
                );


              score += skillsScore;

            }


            /* ================================================
               EXPERIENCE = 20%
            ================================================ */

            experienceScore =
              getExperienceScore(

                experience,

                job.experienceMin,

                job.experienceMax

              );


            score += experienceScore;


            /* ================================================
               LOCATION = 1%
            ================================================ */

            const jobLocation =
              [

                job.companyLocation || "",

                job.industrialArea || "",

                contractorLocation(
                  job.contractorId
                )

              ]
                .filter(Boolean)
                .join(" ");


            if (
              location &&
              jobLocation &&
              locationMatch(
                location,
                jobLocation
              )
            ) {

              locationScore = 1;

              score += 1;

            }


            /* ================================================
               MINIMUM MATCH

               50% से कम job नहीं दिखेगी.
            ================================================ */

            if (score < 50) {
              return null;
            }


            return {

              ...job.toObject(),

              matchScore: score,


              matchDetails: {

                qualification:
                  qualificationScore,

                trade:
                  tradeScore,

                skills:
                  skillsScore,

                experience:
                  experienceScore,

                location:
                  locationScore

              },


              matchedSkills,

              workersRemaining:
                Math.max(

                  0,

                  Number(
                    job.workersRequired || 0
                  )

                  -

                  Number(
                    job.workersFilled || 0
                  )

                )

            };

          })


          .filter(Boolean)


          .sort(

            (a, b) =>

              b.matchScore -
              a.matchScore

          );


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
        "SEARCH JOB ERROR:",
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
          "contractorName mobile industrialArea city location isActive verificationStatus"
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
          "Unable to load job"

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
            "Job not found or access denied"

        });

      }


      const b = req.body;


      /* =====================================================
         UPDATE DATA
      ===================================================== */

      if (
        b.companyName !== undefined
      ) {
        job.companyName = b.companyName;
      }


      if (
        b.companyLocation !== undefined
      ) {
        job.companyLocation =
          b.companyLocation;
      }


      if (
        b.plantUnit !== undefined
      ) {
        job.plantUnit =
          b.plantUnit;
      }


      if (
        b.jobTitle !== undefined
      ) {
        job.jobTitle =
          b.jobTitle;
      }


      if (
        b.department !== undefined
      ) {
        job.department =
          b.department;
      }


      if (
        b.jobType !== undefined
      ) {
        job.jobType =
          b.jobType;
      }


      if (
        b.qualification !== undefined
      ) {
        job.qualification =
          b.qualification;
      }


      if (
        b.trade !== undefined
      ) {
        job.trade =
          b.trade;
      }


      if (
        b.benefits !== undefined
      ) {
        job.benefits =
          b.benefits;
      }


      if (
        b.industrialArea !== undefined
      ) {
        job.industrialArea =
          b.industrialArea;
      }


      if (
        b.joiningDate !== undefined
      ) {
        job.joiningDate =
          b.joiningDate;
      }


      if (
        b.lastDate !== undefined
      ) {
        job.lastDate =
          b.lastDate;
      }


      /* Workers Required */

      if (
        b.workersRequired !== undefined
      ) {

        const workersRequired =
          Number(b.workersRequired);


        if (
          !Number.isInteger(workersRequired) ||
          workersRequired < 1
        ) {

          return res.status(400).json({

            success: false,

            message:
              "Invalid workers required"

          });

        }


        job.workersRequired =
          workersRequired;

      }


      /* Workers Filled */

      if (
        b.workersFilled !== undefined
      ) {

        const workersFilled =
          Number(b.workersFilled);


        if (
          Number.isNaN(workersFilled) ||
          workersFilled < 0
        ) {

          return res.status(400).json({

            success: false,

            message:
              "Invalid workers filled"

          });

        }


        job.workersFilled =
          workersFilled;

      }


      /* Experience */

      if (
        b.experienceMin !== undefined
      ) {

        job.experienceMin =
          Number(b.experienceMin);

      }


      if (
        b.experienceMax !== undefined
      ) {

        job.experienceMax =
          Number(b.experienceMax);

      }


      /* Salary */

      if (
        b.salaryMin !== undefined
      ) {

        job.salaryMin =
          Number(b.salaryMin);

      }


      if (
        b.salaryMax !== undefined
      ) {

        job.salaryMax =
          Number(b.salaryMax);

      }


      /* Skills */

      if (
        b.skills !== undefined
      ) {

        job.skills =
          splitSkills(b.skills);

      }


      /*
        Status change

        Agar manually Closed bheja gaya
        to close kar denge.
      */

      if (
        b.status === "Closed"
      ) {

        job.status = "Closed";

        job.isClosedByAdmin = true;

      }


      await job.save();


      res.json({

        success: true,

        message:
          "Job updated successfully",

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

   Manual Close Vacancy
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
            "Job not found or access denied"

        });

      }


      job.status = "Closed";


      /*
        Important:

        isClosedByAdmin true
        taaki search mein kabhi na aaye.
      */

      job.isClosedByAdmin = true;


      await job.save();


      res.json({

        success: true,

        message:
          "Job closed successfully",

        job

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
   DELETE JOB
========================================================= */

router.delete(
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
            "Job not found or access denied"

        });

      }


      await Job.findByIdAndDelete(
        req.params.id
      );


      res.json({

        success: true,

        message:
          "Job deleted successfully"

      });


    } catch (err) {

      console.error(
        "DELETE JOB ERROR:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Unable to delete job"

      });

    }

  }
);


module.exports = router;
