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
  text = text.replace(/[.,/\\()_:;|]+/g, " ");

  // Hyphen
  text = text.replace(/-/g, " ");

  // Engineering / Engineer variation
  text = text.replace(/\bengineering\b/g, "engineer");

  // Qualification mein "pass" ignore
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

  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

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

   Spelling mistakes ke liye extra support.

   Example:

   electrician
   electrishian

   pronunciation ke aas-paas hone par
   match karne mein help karega.
========================================================= */

function phoneticKey(value) {

  let text = normalizeText(value)
    .replace(/[^a-z0-9]/g, "");

  if (!text) {
    return "";
  }

  /*
    Common sound variations
  */

  text = text.replace(/ph/g, "f");

  text = text.replace(/ght/g, "t");

  text = text.replace(/ck/g, "k");

  text = text.replace(/qu/g, "k");

  text = text.replace(/q/g, "k");

  text = text.replace(/c(?=[eiy])/g, "s");

  text = text.replace(/c/g, "k");

  text = text.replace(/z/g, "s");

  /*
    Common job/trade spelling ending variations.

    electrician
    electrishian
    electrican
  */

  text = text.replace(
    /(ician|ishian|isian|ician|shan|sian)$/g,
    "ian"
  );

  /*
    Remove vowels after first character.
  */

  const first = text.charAt(0);

  const rest =
    text
      .slice(1)
      .replace(/[aeiou]/g, "");

  text =
    first + rest;

  /*
    Repeated letters
  */

  text =
    text.replace(
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

  /*
    Direct containment
  */

  if (
    a.includes(b) ||
    b.includes(a)
  ) {

    const shortLength =
      Math.min(
        a.length,
        b.length
      );

    const longLength =
      Math.max(
        a.length,
        b.length
      );

    if (shortLength >= 4) {

      return (
        shortLength /
        longLength
      );

    }

  }

  const distance =
    levenshtein(a, b);

  const maxLength =
    Math.max(
      a.length,
      b.length
    );

  if (!maxLength) {
    return 0;
  }

  return 1 -
    (
      distance /
      maxLength
    );

}


/* =========================================================
   FUZZY WORD MATCH

   Examples:

   Electrician
   Electrishian
   => MATCH

   Electrican
   Electrician
   => MATCH

   Maintanance
   Maintenance
   => MATCH
========================================================= */

function fuzzyWordMatch(a, b) {

  a = normalizeText(a);
  b = normalizeText(b);

  if (!a || !b) {
    return false;
  }

  /*
    Exact
  */

  if (a === b) {
    return true;
  }


  /*
    Direct containment

    electrical
    electricalengineer

    or

    electrical
    electrical engineer

    token level par handle hoga.
  */

  if (
    a.includes(b) ||
    b.includes(a)
  ) {

    if (
      Math.min(
        a.length,
        b.length
      ) >= 4
    ) {

      return true;

    }

  }


  const minLength =
    Math.min(
      a.length,
      b.length
    );

  const maxLength =
    Math.max(
      a.length,
      b.length
    );


  const distance =
    levenshtein(a, b);


  const similarity =
    1 -
    (
      distance /
      maxLength
    );


  /* -------------------------------------------------------
     VERY SHORT WORDS

     1-3 characters mein fuzzy matching dangerous hai.
  ------------------------------------------------------- */

  if (minLength <= 3) {

    return (
      similarity >= 0.90
    );

  }


  /* -------------------------------------------------------
     4-5 characters

     Maximum approximately 1 typo.
  ------------------------------------------------------- */

  if (minLength <= 5) {

    return (
      distance <= 1 &&
      similarity >= 0.80
    );

  }


  /* -------------------------------------------------------
     6-7 characters

     Approximately 1-2 spelling mistakes.
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
     8+ characters

     2-3 spelling errors allowed depending on length.

     Example:

     electrician
     electrishian

     => MATCH
  ------------------------------------------------------- */

  if (minLength >= 8) {

    let allowedEdits = 2;

    if (minLength >= 12) {
      allowedEdits = 3;
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

     Pronunciation-type spelling errors ke liye.

     Example:

     electrician
     electrishian
  ------------------------------------------------------- */

  if (minLength >= 6) {

    const keyA =
      phoneticKey(a);

    const keyB =
      phoneticKey(b);

    if (
      keyA &&
      keyB &&
      keyA === keyB
    ) {

      return true;

    }

  }


  /*
    Final similarity fallback.
  */

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
    .filter(
      word => word.length > 0
    );

}


/* =========================================================
   FUZZY TEXT MATCH

   Main matching engine.
========================================================= */

function textMatch(
  workerValue,
  jobValue
) {

  const worker =
    normalizeText(workerValue);

  const job =
    normalizeText(jobValue);


  if (!worker || !job) {
    return false;
  }


  /* -------------------------------------------------------
     EXACT
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
     WORKER WORD MATCHING
  ------------------------------------------------------- */

  const workerMatchedCount =
    workerWords.filter(
      workerWord => {

        return jobWords.some(
          jobWord =>
            fuzzyWordMatch(
              workerWord,
              jobWord
            )
        );

      }
    ).length;


  /* -------------------------------------------------------
     JOB WORD MATCHING
  ------------------------------------------------------- */

  const jobMatchedCount =
    jobWords.filter(
      jobWord => {

        return workerWords.some(
          workerWord =>
            fuzzyWordMatch(
              workerWord,
              jobWord
            )
        );

      }
    ).length;


  const workerCoverage =
    workerMatchedCount /
    workerWords.length;


  const jobCoverage =
    jobMatchedCount /
    jobWords.length;


  /* -------------------------------------------------------
     SINGLE WORD

     Electrician
     Electrishian

     => MATCH
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
     ONE SIDE SINGLE WORD

     Electrical
     Electrical Engineer

     => MATCH

     Mechanical
     Electrical Engineer

     => NO MATCH
  ------------------------------------------------------- */

  if (
    workerWords.length === 1
  ) {

    return (
      jobMatchedCount >= 1 &&
      workerCoverage >= 1
    );

  }


  if (
    jobWords.length === 1
  ) {

    return (
      workerMatchedCount >= 1 &&
      jobCoverage >= 1
    );

  }


  /* -------------------------------------------------------
     MULTI WORD MATCH

     Minimum 75% coverage on both sides.
  ------------------------------------------------------- */

  if (
    workerCoverage >= 0.75 &&
    jobCoverage >= 0.75
  ) {

    return true;

  }


  /* -------------------------------------------------------
     WORKER COMPLETE MATCH

     Example:

     Worker:
     Electrical Engineer

     Job:
     Senior Electrical Engineer
  ------------------------------------------------------- */

  if (
    workerCoverage === 1 &&
    workerWords.length >= 2
  ) {

    return true;

  }


  /* -------------------------------------------------------
     JOB COMPLETE MATCH
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
        Number(
          b.workersRequired
        );


      if (
        !b.companyName ||
        !b.jobTitle ||
        !Number.isInteger(
          workersRequired
        ) ||
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

          experienceMin:
            Number(
              b.experienceMin || 0
            ),

          experienceMax:
            Number(
              b.experienceMax || 99
            ),

          salaryMin:
            Number(
              b.salaryMin || 0
            ),

          salaryMax:
            Number(
              b.salaryMax || 0
            ),

          skills:
            splitSkills(
              b.skills
            )

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

      const jobs = await Job.find({
        contractorId: req.contractorId
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
        message: "Unable to load jobs"
      });

    }

  }
);

// ===============================
// CLOSE JOB VACANCY
// ===============================
router.put("/:id/close", auth, async (req, res) => {
  try {
    const job = await JobRequirement.findOne({
      _id: req.params.id,
      contractorId: req.contractorId
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job vacancy not found"
      });
    }

    job.status = "Closed";
    job.isClosedByAdmin = true;

    await job.save();

    res.json({
      success: true,
      message: "Vacancy closed successfully",
      job
    });

  } catch (error) {
    console.error("Close vacancy error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to close vacancy"
    });
  }
});
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


      const experienceRaw =
        req.query.experience;


      const experience =
        Number(
          experienceRaw || 0
        );


      const workerSkills =
        splitSkills(
          req.query.skills || ""
        );


      /* =====================================================
         SEARCH VALIDATION
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
          "contractorName mobile industrialArea city location isActive verificationStatus"
        )
        .sort({
          createdAt: -1
        });


      /* =====================================================
         ELIGIBILITY
      ===================================================== */

      const eligibleJobs =
        jobs.filter(job => {

          const contractor =
            job.contractorId;


          /* -------------------------------------------------
             CONTRACTOR EXISTS
          ------------------------------------------------- */

          if (!contractor) {
            return false;
          }


          /* -------------------------------------------------
             CONTRACTOR ACTIVE
          ------------------------------------------------- */

          if (
            contractor.isActive === false
          ) {

            return false;

          }


          /* -------------------------------------------------
             CONTRACTOR APPROVED
          ------------------------------------------------- */

          if (
            contractor.verificationStatus !==
            "Approved"
          ) {

            return false;

          }


          /* -------------------------------------------------
             VACANCY
          ------------------------------------------------- */

          if (
            Number(
              job.workersFilled || 0
            ) >=
            Number(
              job.workersRequired || 0
            )
          ) {

            return false;

          }


          /* -------------------------------------------------
             OWN JOB HIDE
          ------------------------------------------------- */

          if (
            String(
              contractor._id
            ) ===
            String(
              req.contractorId
            )
          ) {

            return false;

          }


          /* -------------------------------------------------
             EXPERIENCE

             Experience score mein add nahi hota.
             Sirf eligibility hai.
          ------------------------------------------------- */

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

        });


      /* =====================================================
         SCORE
      ===================================================== */

      const results =
        eligibleJobs
          .map(job => {

            let score = 0;


            let qualificationScore = 0;

            let tradeScore = 0;

            let skillsScore = 0;

            let locationScore = 0;


            /* =================================================
               QUALIFICATION = 40%
            ================================================= */

            if (
              qualification &&
              job.qualification &&
              textMatch(
                qualification,
                job.qualification
              )
            ) {

              qualificationScore = 40;

              score += 40;

            }


            /* =================================================
               TRADE = 30%
            ================================================= */

            if (
              trade &&
              job.trade &&
              textMatch(
                trade,
                job.trade
              )
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
              );


            const matchedSkills =
              workerSkills.filter(
                workerSkill => {

                  return jobSkills.some(
                    jobSkill => {

                      return textMatch(
                        workerSkill,
                        jobSkill
                      );

                    }
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


            /* =================================================
               LOCATION = 10%
            ================================================= */

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

              locationScore = 10;

              score += 10;

            }


            /* =================================================
               PREFERRED JOB

               Ye percentage mein add nahi hota.

               Agar worker ne Preferred Job diya hai,
               to job title se match hona chahiye.
            ================================================= */

            if (
              preferredJob
            ) {

              const jobTitle =
                normalizeText(
                  job.jobTitle
                );


              if (
                !jobTitle ||
                !textMatch(
                  preferredJob,
                  jobTitle
                )
              ) {

                return null;

              }

            }


            /* =================================================
               MINIMUM MATCH = 61%
            ================================================= */

            if (
              score < 61
            ) {

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

                location:
                  locationScore

              },

              matchedSkills,

              workersRemaining:
                Math.max(
                  0,
                  Number(
                    job.workersRequired || 0
                  ) -
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


      const b =
        req.body;


      const updateData = {
        ...b
      };


      if (
        b.workersRequired !==
        undefined
      ) {

        const workersRequired =
          Number(
            b.workersRequired
          );


        if (
          !Number.isInteger(
            workersRequired
          ) ||
          workersRequired < 1
        ) {

          return res.status(400).json({

            success: false,

            message:
              "Invalid workers required"

          });

        }


        updateData.workersRequired =
          workersRequired;

      }


      if (
        b.experienceMin !==
        undefined
      ) {

        updateData.experienceMin =
          Number(
            b.experienceMin
          );

      }


      if (
        b.experienceMax !==
        undefined
      ) {

        updateData.experienceMax =
          Number(
            b.experienceMax
          );

      }


      if (
        b.salaryMin !==
        undefined
      ) {

        updateData.salaryMin =
          Number(
            b.salaryMin
          );

      }


      if (
        b.salaryMax !==
        undefined
      ) {

        updateData.salaryMax =
          Number(
            b.salaryMax
          );

      }


      if (
        b.skills !==
        undefined
      ) {

        updateData.skills =
          splitSkills(
            b.skills
          );

      }


      delete updateData.contractorId;

      delete updateData._id;

      delete updateData.createdAt;

      delete updateData.updatedAt;


      const updatedJob =
        await Job.findByIdAndUpdate(

          req.params.id,

          updateData,

          {
            new: true,
            runValidators: true
          }

        );


      res.json({

        success: true,

        message:
          "Job updated successfully",

        job:
          updatedJob

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
            "Job not found or access denied"

        });

      }


      job.status =
        "Closed";


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
