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

  text = text.replace(/[.,/\\()_:;|]+/g, " ");

  text = text.replace(/-/g, " ");

  text = text.replace(
    /\bengineering\b/g,
    "engineer"
  );

  text = text.replace(
    /\bpass\b/g,
    ""
  );

  text = text.replace(
    /\s+/g,
    " "
  ).trim();

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
      .flatMap(item =>
        String(item || "").split(",")
      )
      .map(item =>
        normalizeSkill(item)
      )
      .filter(Boolean);

  }

  return String(value || "")
    .split(",")
    .map(item =>
      normalizeSkill(item)
    )
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
========================================================= */

function phoneticKey(value) {

  let text = normalizeText(value)
    .replace(/[^a-z0-9]/g, "");

  if (!text) {
    return "";
  }

  text = text.replace(/ph/g, "f");

  text = text.replace(/ght/g, "t");

  text = text.replace(/ck/g, "k");

  text = text.replace(/qu/g, "k");

  text = text.replace(/q/g, "k");

  text = text.replace(
    /c(?=[eiy])/g,
    "s"
  );

  text = text.replace(
    /c/g,
    "k"
  );

  text = text.replace(
    /z/g,
    "s"
  );

  text = text.replace(
    /(ician|ishian|isian|shan|sian)$/g,
    "ian"
  );

  const first =
    text.charAt(0);

  const rest =
    text
      .slice(1)
      .replace(/[aeiou]/g, "");

  text =
    first + rest;

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
========================================================= */

function fuzzyWordMatch(a, b) {

  a = normalizeText(a);
  b = normalizeText(b);

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

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

  if (minLength <= 3) {

    return (
      similarity >= 0.90
    );

  }

  if (minLength <= 5) {

    return (
      distance <= 1 &&
      similarity >= 0.80
    );

  }

  if (minLength <= 7) {

    if (
      distance <= 2 &&
      similarity >= 0.72
    ) {

      return true;

    }

  }

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
    .map(word =>
      word.trim()
    )
    .filter(
      word =>
        word.length > 0
    );

}


/* =========================================================
   FUZZY TEXT MATCH
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

  if (worker === job) {
    return true;
  }

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

  if (
    workerWords.length === 1 &&
    jobWords.length === 1
  ) {

    return fuzzyWordMatch(
      workerWords[0],
      jobWords[0]
    );

  }

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

  if (
    workerCoverage >= 0.75 &&
    jobCoverage >= 0.75
  ) {

    return true;

  }

  if (
    workerCoverage === 1 &&
    workerWords.length >= 2
  ) {

    return true;

  }

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
        b.workersRequired === "" ||
        b.workersRequired === null ||
        b.workersRequired === undefined
          ? null
          : Number(
              b.workersRequired
            );


      /* =====================================================
         REQUIRED FIELDS
      ===================================================== */

      if (!b.companyName) {

        return res.status(400).json({
          success: false,
          message:
            "Company name is required"
        });

      }

      if (!b.jobTitle) {

        return res.status(400).json({
          success: false,
          message:
            "Job title is required"
        });

      }

      if (!b.qualification) {

        return res.status(400).json({
          success: false,
          message:
            "Qualification is required"
        });

      }

      if (!b.trade) {

        return res.status(400).json({
          success: false,
          message:
            "Trade is required"
        });

      }

      if (
        b.experienceMin === undefined ||
        b.experienceMin === null ||
        b.experienceMin === ""
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Experience is required"
        });

      }

      if (!b.companyLocation) {

        return res.status(400).json({
          success: false,
          message:
            "Location is required"
        });

      }


      /* =====================================================
         WORKERS REQUIRED OPTIONAL
      ===================================================== */

      if (
        workersRequired !== null &&
        (
          !Number.isInteger(
            workersRequired
          ) ||
          workersRequired < 1
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid workers required"
        });

      }


      /* =====================================================
         GENDER
      ===================================================== */

      const allowedGender = [
        "Any",
        "Male",
        "Female",
        "Other"
      ];

      const gender =
        allowedGender.includes(
          String(b.gender || "")
        )
          ? String(b.gender)
          : "Any";


      /* =====================================================
         CREATE
      ===================================================== */

      const job =
        await Job.create({

          ...b,

          contractorId:
            req.contractorId,

          workersRequired,

          gender,

          experienceMin:
            Number(
              b.experienceMin
            ),

          experienceMax:
            b.experienceMax === "" ||
            b.experienceMax === undefined ||
            b.experienceMax === null
              ? 99
              : Number(
                  b.experienceMax
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


      return res.status(201).json({

        success: true,

        job

      });


    } catch (err) {

      console.error(
        "CREATE JOB ERROR:",
        err
      );

      return res.status(500).json({

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

      return res.json({
        success: true,
        jobs
      });

    } catch (err) {

      console.error(
        "MY JOBS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load jobs"
      });

    }

  }
);


/* =========================================================
   CLOSE JOB VACANCY
========================================================= */

router.put(
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
            "Job vacancy not found"
        });

      }

      job.status = "Closed";
      job.isClosedByAdmin = true;

      await job.save();

      return res.json({
        success: true,
        message:
          "Vacancy closed successfully",
        job
      });

    } catch (err) {

      console.error(
        "CLOSE JOB ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to close vacancy"
      });

    }

  }
);


/* =========================================================
   WORKER JOB SEARCH

   MATCHING:

   Qualification = 25%
   Trade         = 25%
   Location      = 25%
   Gender        = 25%

   TOTAL = 100%

   Experience, Skills and Preferred Job
   basic matching ko block nahi karte.

========================================================= */

router.get(
  "/search",
  auth,
  limit("workerSearches"),
  async (req, res) => {

    try {

      /* =====================================================
         SEARCH INPUT
      ===================================================== */

      const qualification =
        normalizeQualification(
          req.query.qualification
        );

      const trade =
        normalizeTrade(
          req.query.trade
        );

      const location =
        normalizeText(
          req.query.location ||
          req.query.preferredLocation
        );

      const gender =
        normalizeText(
          req.query.gender
        );


      /* =====================================================
         OPTIONAL INFORMATION
      ===================================================== */

      const experienceRaw =
        req.query.experience;

      const experience =
        Number(
          experienceRaw || 0
        );

      const preferredJob =
        normalizeText(
          req.query.preferredJob
        );

      const workerSkills =
        splitSkills(
          req.query.skills || ""
        );


      /* =====================================================
         REQUIRED SEARCH FIELDS
      ===================================================== */

      if (!qualification) {

        return res.status(400).json({
          success: false,
          message:
            "Qualification is required"
        });

      }

      if (!trade) {

        return res.status(400).json({
          success: false,
          message:
            "Trade is required"
        });

      }

      if (!location) {

        return res.status(400).json({
          success: false,
          message:
            "Location is required"
        });

      }

      if (!gender) {

        return res.status(400).json({
          success: false,
          message:
            "Gender is required"
        });

      }


      /* =====================================================
         EXPERIENCE VALIDATION
      ===================================================== */

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
         FETCH JOBS
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
         BASIC ELIGIBILITY
      ===================================================== */

      const eligibleJobs =
        jobs.filter(job => {

          const contractor =
            job.contractorId;


          /* Contractor must exist */
          if (!contractor) {
            return false;
          }


          /* Contractor active */
          if (
            contractor.isActive === false
          ) {
            return false;
          }


          /* Contractor approved */
          if (
            contractor.verificationStatus !==
            "Approved"
          ) {
            return false;
          }


          /* =================================================
             VACANCY CHECK

             IMPORTANT:

             workersRequired blank/null
             => job remains searchable.

             workersRequired > 0
             AND filled >= required
             => job excluded.
          ================================================= */

          const workersRequired =
            Number(
              job.workersRequired || 0
            );

          const workersFilled =
            Number(
              job.workersFilled || 0
            );


          if (
            workersRequired > 0 &&
            workersFilled >=
              workersRequired
          ) {

            return false;

          }


          /* Own jobs hide */
          if (
            String(contractor._id) ===
            String(req.contractorId)
          ) {

            return false;

          }


          return true;

        });


      /* =====================================================
         MATCHING
      ===================================================== */

      const results =
        eligibleJobs
          .map(job => {

            let qualificationScore = 0;
            let tradeScore = 0;
            let locationScore = 0;
            let genderScore = 0;


            /* =================================================
               QUALIFICATION = 25
            ================================================= */

            if (
              qualification &&
              job.qualification &&
              textMatch(
                qualification,
                job.qualification
              )
            ) {

              qualificationScore = 25;

            }


            /* =================================================
               TRADE = 25
            ================================================= */

            if (
              trade &&
              job.trade &&
              textMatch(
                trade,
                job.trade
              )
            ) {

              tradeScore = 25;

            }


            /* =================================================
               LOCATION = 25
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

              locationScore = 25;

            }


            /* =================================================
               GENDER = 25

               Job Gender:
               Any
               Male
               Female
               Other

               Old jobs without gender:
               allowed for everyone.
            ================================================= */

            const jobGender =
              normalizeText(
                job.gender
              );


            const genderAllowed =
              !jobGender ||
              jobGender === "any" ||
              jobGender === "both" ||
              jobGender === "all" ||
              jobGender === "n a" ||
              jobGender === "na" ||
              jobGender ===
                "not applicable";


            if (genderAllowed) {

              genderScore = 25;

            }

            else if (
              textMatch(
                gender,
                jobGender
              )
            ) {

              genderScore = 25;

            }


            /* =================================================
               TOTAL
            ================================================= */

            const score =
              qualificationScore +
              tradeScore +
              locationScore +
              genderScore;


            /* =================================================
               OPTIONAL SKILLS
            ================================================= */

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


            /* =================================================
               ALL 4 MATCH REQUIRED
            ================================================= */

            if (
              qualificationScore !== 25 ||
              tradeScore !== 25 ||
              locationScore !== 25 ||
              genderScore !== 25
            ) {

              return null;

            }


            /* =================================================
               REMAINING VACANCY

               null means:
               Workers Required was not specified.
            ================================================= */

            const workersRequired =
              Number(
                job.workersRequired || 0
              );

            const workersFilled =
              Number(
                job.workersFilled || 0
              );


            const workersRemaining =
              workersRequired > 0
                ? Math.max(
                    0,
                    workersRequired -
                    workersFilled
                  )
                : null;


            /* =================================================
               RESULT
            ================================================= */

            return {

              ...job.toObject(),

              matchScore:
                score,

              matchDetails: {

                qualification:
                  qualificationScore,

                trade:
                  tradeScore,

                location:
                  locationScore,

                gender:
                  genderScore

              },

              matchedSkills,

              workersRemaining

            };

          })

          .filter(Boolean)

          .sort(
            (a, b) => {

              if (
                b.matchScore !==
                a.matchScore
              ) {

                return (
                  b.matchScore -
                  a.matchScore
                );

              }

              return (
                new Date(
                  b.createdAt || 0
                ) -
                new Date(
                  a.createdAt || 0
                )
              );

            }
          );


      /* =====================================================
         RESPONSE
      ===================================================== */

      return res.json({

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

      return res.status(500).json({

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


      return res.json({
        success: true,
        job
      });


    } catch (err) {

      console.error(
        "GET JOB ERROR:",
        err
      );

      return res.status(500).json({
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


      /* =====================================================
         WORKERS REQUIRED

         Blank/null allowed.
      ===================================================== */

      if (
        b.workersRequired !==
        undefined
      ) {

        if (
          b.workersRequired === "" ||
          b.workersRequired === null
        ) {

          updateData.workersRequired =
            null;

        } else {

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

      }


      /* =====================================================
         GENDER
      ===================================================== */

      if (
        b.gender !== undefined
      ) {

        const allowedGender = [
          "Any",
          "Male",
          "Female",
          "Other"
        ];


        const gender =
          String(
            b.gender || "Any"
          );


        if (
          !allowedGender.includes(
            gender
          )
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid gender"
          });

        }


        updateData.gender =
          gender;

      }


      /* =====================================================
         EXPERIENCE
      ===================================================== */

      if (
        b.experienceMin !==
        undefined
      ) {

        const experienceMin =
          Number(
            b.experienceMin
          );


        if (
          Number.isNaN(
            experienceMin
          ) ||
          experienceMin < 0
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid minimum experience"
          });

        }


        updateData.experienceMin =
          experienceMin;

      }


      if (
        b.experienceMax !==
        undefined
      ) {

        const experienceMax =
          Number(
            b.experienceMax
          );


        if (
          Number.isNaN(
            experienceMax
          ) ||
          experienceMax < 0
        ) {

          return res.status(400).json({
            success: false,
            message:
              "Invalid maximum experience"
          });

        }


        updateData.experienceMax =
          experienceMax;

      }


      /* =====================================================
         SALARY
      ===================================================== */

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


      /* =====================================================
         SKILLS
      ===================================================== */

      if (
        b.skills !==
        undefined
      ) {

        updateData.skills =
          splitSkills(
            b.skills
          );

      }


      /* =====================================================
         PROTECTED FIELDS
      ===================================================== */

      delete updateData.contractorId;

      delete updateData._id;

      delete updateData.createdAt;

      delete updateData.updatedAt;


      /* =====================================================
         UPDATE
      ===================================================== */

      const updatedJob =
        await Job.findByIdAndUpdate(

          req.params.id,

          updateData,

          {
            new: true,
            runValidators: true
          }

        );


      return res.json({

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

      return res.status(500).json({

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

      job.isClosedByAdmin =
        true;


      await job.save();


      return res.json({

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

      return res.status(500).json({

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


      return res.json({

        success: true,

        message:
          "Job deleted successfully"

      });


    } catch (err) {

      console.error(
        "DELETE JOB ERROR:",
        err
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to delete job"

      });

    }

  }
);


module.exports = router;
