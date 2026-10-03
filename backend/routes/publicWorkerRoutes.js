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

function generateTrackingToken() {
  return crypto.randomBytes(24).toString("hex");
}
/* =========================================================
   TEXT NORMALIZATION
========================================================= */

function normalizeText(value) {

  let text =
    String(value || "")
      .trim()
      .toLowerCase();


  text =
    text.replace(
      /[.,/\\()_:;|]+/g,
      " "
    );


  text =
    text.replace(
      /-/g,
      " "
    );


  /*
   * Common word normalization
   */

  text =
    text.replace(
      /\bengineering\b/g,
      "engineer"
    );


  text =
    text.replace(
      /\bengineerings\b/g,
      "engineer"
    );


  text =
    text.replace(
      /\bpass\b/g,
      ""
    );


  /*
   * Common industrial spelling normalization
   */

  text =
    text.replace(
      /\belectrition\b/g,
      "electrician"
    );


  text =
    text.replace(
      /\belectricien\b/g,
      "electrician"
    );


  text =
    text.replace(
      /\belectricals\b/g,
      "electrical"
    );


  text =
    text.replace(
      /\btechnician\b/g,
      "technician"
    );


  text =
    text.replace(
      /\btechician\b/g,
      "technician"
    );


  text =
    text.replace(
      /\bmaintanance\b/g,
      "maintenance"
    );


  text =
    text.replace(
      /\bmaintainance\b/g,
      "maintenance"
    );


  text =
    text.replace(
      /\bsuperviser\b/g,
      "supervisor"
    );


  text =
    text.replace(
      /\bsupervisor\b/g,
      "supervisor"
    );


  text =
    text.replace(
      /\bplc programmer\b/g,
      "plc"
    );


  text =
    text.replace(
      /\biti\b/g,
      "iti"
    );


  text =
    text.replace(
      /\bdiploma\b/g,
      "diploma"
    );


  text =
    text.replace(
      /\bbtech\b/g,
      "btech"
    );


  text =
    text.replace(
      /\bb tech\b/g,
      "btech"
    );


  text =
    text.replace(
      /\bmtech\b/g,
      "mtech"
    );


  text =
    text.replace(
      /\bm tech\b/g,
      "mtech"
    );


  text =
    text.replace(
      /\s+/g,
      " "
    )
    .trim();


  return text;

}


/* =========================================================
   QUALIFICATION
========================================================= */

function normalizeQualification(
  value
) {

  return normalizeText(
    value
  );

}


/* =========================================================
   TRADE
========================================================= */

function normalizeTrade(
  value
) {

  return normalizeText(
    value
  );

}


/* =========================================================
   SKILL
========================================================= */

function normalizeSkill(
  value
) {

  return normalizeText(
    value
  );

}


/* =========================================================
   SKILLS ARRAY
========================================================= */

function splitSkills(
  value
) {

  if (
    Array.isArray(value)
  ) {

    return value
      .flatMap(
        item =>
          String(
            item || ""
          ).split(",")
      )
      .map(
        item =>
          normalizeSkill(
            item
          )
      )
      .filter(Boolean);

  }


  return String(
    value || ""
  )
    .split(",")
    .map(
      item =>
        normalizeSkill(
          item
        )
    )
    .filter(Boolean);

}


/* =========================================================
   LEVENSHTEIN DISTANCE
========================================================= */

function levenshtein(
  a,
  b
) {

  a =
    String(a || "");

  b =
    String(b || "");


  if (
    a === b
  ) {

    return 0;

  }


  if (!a.length) {

    return b.length;

  }


  if (!b.length) {

    return a.length;

  }


  const matrix = [];


  for (
    let i = 0;
    i <= b.length;
    i++
  ) {

    matrix[i] = [i];

  }


  for (
    let j = 0;
    j <= a.length;
    j++
  ) {

    matrix[0][j] =
      j;

  }


  for (
    let i = 1;
    i <= b.length;
    i++
  ) {

    for (
      let j = 1;
      j <= a.length;
      j++
    ) {

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


  return matrix[
    b.length
  ][
    a.length
  ];

}


/* =========================================================
   PHONETIC NORMALIZATION
========================================================= */

function phoneticKey(
  value
) {

  let text =
    normalizeText(
      value
    )
      .replace(
        /[^a-z0-9]/g,
        ""
      );


  if (!text) {

    return "";

  }


  text =
    text.replace(
      /ph/g,
      "f"
    );


  text =
    text.replace(
      /ght/g,
      "t"
    );


  text =
    text.replace(
      /ck/g,
      "k"
    );


  text =
    text.replace(
      /qu/g,
      "k"
    );


  text =
    text.replace(
      /q/g,
      "k"
    );


  text =
    text.replace(
      /c(?=[eiy])/g,
      "s"
    );


  text =
    text.replace(
      /c/g,
      "k"
    );


  text =
    text.replace(
      /z/g,
      "s"
    );


  text =
    text.replace(
      /(ician|ishian|isian|shan|sian)$/g,
      "ian"
    );


  const first =
    text.charAt(0);


  const rest =
    text
      .slice(1)
      .replace(
        /[aeiou]/g,
        ""
      );


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
   FUZZY WORD MATCH
========================================================= */

function fuzzyWordMatch(
  a,
  b
) {

  a =
    normalizeText(a);

  b =
    normalizeText(b);


  if (
    !a ||
    !b
  ) {

    return false;

  }


  if (
    a === b
  ) {

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
    levenshtein(
      a,
      b
    );


  const similarity =
    maxLength
      ? 1 -
        (
          distance /
          maxLength
        )
      : 0;


  if (
    minLength <= 3
  ) {

    return (
      similarity >= 0.90
    );

  }


  if (
    minLength <= 5
  ) {

    return (
      distance <= 1 &&
      similarity >= 0.80
    );

  }


  if (
    minLength <= 7
  ) {

    if (
      distance <= 2 &&
      similarity >= 0.72
    ) {

      return true;

    }

  }


  if (
    minLength >= 8
  ) {

    let allowedEdits =
      2;


    if (
      minLength >= 12
    ) {

      allowedEdits =
        3;

    }


    if (
      distance <=
        allowedEdits &&
      similarity >= 0.70
    ) {

      return true;

    }

  }


  if (
    minLength >= 6
  ) {

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


  if (
    minLength >= 6
  ) {

    return (
      similarity >= 0.72
    );

  }


  return false;

}


/* =========================================================
   TEXT TOKENIZATION
========================================================= */

function getWords(
  value
) {

  return normalizeText(
    value
  )
    .split(" ")
    .map(
      word =>
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
    normalizeText(
      workerValue
    );


  const job =
    normalizeText(
      jobValue
    );


  if (
    !worker ||
    !job
  ) {

    return false;

  }


  if (
    worker === job
  ) {

    return true;

  }


  if (
    worker.includes(job) ||
    job.includes(worker)
  ) {

    return true;

  }


  const workerWords =
    getWords(
      worker
    );


  const jobWords =
    getWords(
      job
    );


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


  /*
   * Normal multi-word match
   */

  if (
    workerCoverage >= 0.75 &&
    jobCoverage >= 0.75
  ) {

    return true;

  }


  /*
   * Worker entered complete
   * phrase which matches job.
   */

  if (
    workerCoverage === 1 &&
    workerWords.length >= 2
  ) {

    return true;

  }


  /*
   * Job contains complete worker
   * phrase.
   */

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

function contractorLocation(
  contractor
) {

  if (!contractor) {

    return "";

  }


  return [

    contractor.industrialArea ||
      "",

    contractor.city ||
      "",

    contractor.location ||
      ""

  ]
    .filter(Boolean)
    .join(" ");

}

/* =========================================================
   PUBLIC JOB SEARCH BY CONTRACTOR NAME
========================================================= */

router.get(
  "/jobs/search-by-contractor",
  async (req, res) => {

    try {

      const contractorName =
        normalizeText(
          req.query.contractorName
        );


      /* =====================================================
         VALIDATION
      ===================================================== */

      if (!contractorName) {

        return res.status(400).json({

          success: false,

          message:
            "Contractor name is required."

        });

      }


      /* =====================================================
         GET ACTIVE CONTRACTORS
      ===================================================== */

      const contractors =
        await Contractor.find({

          isActive: {
            $ne: false
          },

          $or: [

            {
              verificationStatus:
                "Approved"
            },

            {
              verificationStatus: {
                $exists: false
              }
            },

            {
              verificationStatus: null
            },

            {
              verificationStatus: ""
            }

          ]

        })
        .select(
          "contractorName industrialArea city location"
        );


      const matchedContractorIds = [];


      /* =====================================================
         FUZZY CONTRACTOR NAME MATCH
      ===================================================== */

      for (
        const contractor of contractors
      ) {

        const dbName =
          normalizeText(
            contractor.contractorName
          );


        if (!dbName) {

          continue;

        }


        if (
          textMatch(
            contractorName,
            dbName
          )
        ) {

          matchedContractorIds.push(
            contractor._id
          );

        }

      }


      /* =====================================================
         NO CONTRACTOR FOUND
      ===================================================== */

      if (
        !matchedContractorIds.length
      ) {

        return res.json({

          success: true,

          count: 0,

          jobs: []

        });

      }


      /* =====================================================
         GET ACTIVE JOBS
      ===================================================== */

      const jobs =
        await Job.find({

          contractorId: {
            $in:
              matchedContractorIds
          },

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

        .populate(
          "contractorId",
          [

            "contractorName",
            "industrialArea",
            "city",
            "location",
            "isActive",
            "verificationStatus"

          ]
        )

        .sort({

          createdAt: -1

        });


      const results = [];


      /* =====================================================
         PROCESS JOBS
      ===================================================== */

      for (
        const job of jobs
      ) {

        const contractor =
          job.contractorId;


        if (!contractor) {

          continue;

        }


        /* ===================================================
           CONTRACTOR STATUS
        =================================================== */

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


        /* ===================================================
           VACANCY CHECK
        =================================================== */

        if (
          job.workersRequired !== null &&
          job.workersRequired !== undefined
        ) {

          const remaining =
            Number(
              job.workersRequired || 0
            ) -
            Number(
              job.workersFilled || 0
            );


          if (
            remaining <= 0
          ) {

            continue;

          }

        }


        /* ===================================================
           REMAINING VACANCY
        =================================================== */

        const workersRemaining =
          job.workersRequired !== null &&
          job.workersRequired !== undefined

            ? Math.max(

                0,

                Number(
                  job.workersRequired
                ) -
                Number(
                  job.workersFilled || 0
                )

              )

            : null;


        /* ===================================================
           PUBLIC RESPONSE

           Contractor mobile/details
           intentionally NOT exposed.
        =================================================== */

        results.push({

          _id:
            job._id,

          companyName:
            job.companyName ||
            contractor.contractorName ||
            "Company",

          companyLocation:
            job.companyLocation ||
            [
              contractor.industrialArea,
              contractor.city,
              contractor.location
            ]
              .filter(Boolean)
              .join(", "),

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

          /*
           * Contractor name can be shown
           * publicly because user searched
           * specifically by contractor.
           */

          contractorName:
            contractor.contractorName,

          searchType:
            "contractor"

        });

      }


      /* =====================================================
         RESPONSE
      ===================================================== */

      return res.json({

        success: true,

        count:
          results.length,

        contractorName:

          results.length

            ? results[0].contractorName

            : contractorName,

        jobs:
          results

      });

    }

    catch (error) {

      console.error(
        "PUBLIC CONTRACTOR JOB SEARCH ERROR:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Failed to search contractor jobs.",

        error:
          error.message

      });

    }

  }

);
/* =========================================================
   PUBLIC JOB SEARCH
========================================================= */

router.get(
  "/jobs/search",
  async (req, res) => {

    try {

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
          req.query.skills ||
          ""
        );


      /* =====================================================
         REQUIRED SEARCH FIELDS
      ===================================================== */

      if (
        !qualification ||
        !trade ||
        !location ||
        !gender
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Qualification, Trade, Location and Gender are required."

        });

      }


      /* =====================================================
         EXPERIENCE VALIDATION
      ===================================================== */

      if (
        experienceRaw !== undefined &&
        experienceRaw !== ""
      ) {

        if (
          Number.isNaN(
            experience
          ) ||
          experience < 0
        ) {

          return res.status(400).json({

            success: false,

            message:
              "Invalid experience value."

          });

        }

      }


      /* =====================================================
         GET ACTIVE JOBS
      ===================================================== */

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
        .populate(
          "contractorId",
          [
            "contractorName",
            "mobile",
            "industrialArea",
            "city",
            "location",
            "isActive",
            "verificationStatus"
          ]
        )
        .sort({
          createdAt: -1
        });


      const results = [];


      /* =====================================================
         MATCH EACH JOB
      ===================================================== */

      for (
        const job of jobs
      ) {

        const contractor =
          job.contractorId;


        /* ===================================================
           CONTRACTOR VALIDATION
        =================================================== */

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


        /* ===================================================
           VACANCY
        =================================================== */

        if (
          job.workersRequired !== null &&
          job.workersRequired !== undefined
        ) {

          const remaining =
            Number(
              job.workersRequired ||
              0
            ) -
            Number(
              job.workersFilled ||
              0
            );


          if (
            remaining <= 0
          ) {

            continue;

          }

        }


        /* ===================================================
           QUALIFICATION
        =================================================== */

        const qualificationMatched =
          textMatch(
            qualification,
            job.qualification
          );


        if (
          !qualificationMatched
        ) {

          continue;

        }


        /* ===================================================
           TRADE
        =================================================== */

        const tradeMatched =
          textMatch(
            trade,
            job.trade
          );


        if (
          !tradeMatched
        ) {

          continue;

        }


        /* ===================================================
           LOCATION
        =================================================== */

        const jobLocation =
          normalizeText(

            [

              job.companyLocation,

              job.industrialArea,

              contractorLocation(
                contractor
              )

            ]

              .filter(Boolean)

              .join(" ")

          );


        const locationMatched =
          locationMatch(
            location,
            jobLocation
          );


        if (
          !locationMatched
        ) {

          continue;

        }


        /* ===================================================
           GENDER
        =================================================== */

        const jobGender =
          normalizeText(
            job.gender ||
            "Any"
          );


        const genderIsAny =
          !jobGender ||
          [

            "any",
            "both",
            "all",
            "n/a",
            "na",
            "not applicable",
            "not specified"

          ].includes(
            jobGender
          );


        let genderMatched =
          false;


        if (
          genderIsAny
        ) {

          genderMatched =
            true;

        }
        else {

          genderMatched =
            textMatch(
              gender,
              jobGender
            );

        }


        if (
          !genderMatched
        ) {

          continue;

        }


        /* ===================================================
           EXPERIENCE
        =================================================== */

        let experienceMatched =
          true;


        if (
          experienceRaw !== undefined &&
          experienceRaw !== ""
        ) {

          const minExperience =
            Number(
              job.experienceMin ||
              0
            );


          const maxExperience =
            Number(
              job.experienceMax ??
              99
            );


          experienceMatched =
            experience >=
              minExperience &&
            experience <=
              maxExperience;


          if (
            !experienceMatched
          ) {

            continue;

          }

        }


        /* ===================================================
           PREFERRED JOB
        =================================================== */

        let preferredJobMatched =
          true;


        if (
          preferredJob
        ) {

          preferredJobMatched =
            !!job.jobTitle &&
            textMatch(
              preferredJob,
              job.jobTitle
            );


          if (
            !preferredJobMatched
          ) {

            continue;

          }

        }


        /* ===================================================
           SKILLS
        =================================================== */

        let matchedSkills = [];


        if (
          workerSkills.length &&
          Array.isArray(
            job.skills
          )
        ) {

          matchedSkills =
            workerSkills.filter(
              workerSkill => {

                return job.skills.some(
                  jobSkill =>
                    textMatch(
                      workerSkill,
                      jobSkill
                    )
                );

              }
            );

        }


        /* ===================================================
           MATCH SCORE

           Qualification = 25
           Trade         = 25
           Location      = 25
           Gender        = 25

           Total         = 100
        =================================================== */

        const qualificationScore =
          qualificationMatched
            ? 25
            : 0;


        const tradeScore =
          tradeMatched
            ? 25
            : 0;


        const locationScore =
          locationMatched
            ? 25
            : 0;


        const genderScore =
          genderMatched
            ? 25
            : 0;


        const score =
          qualificationScore +
          tradeScore +
          locationScore +
          genderScore;


        /*
         * Safety check:
         * All four must match.
         */

        if (
          qualificationScore !== 25 ||
          tradeScore !== 25 ||
          locationScore !== 25 ||
          genderScore !== 25
        ) {

          continue;

        }


        /* ===================================================
           REMAINING VACANCY
        =================================================== */

        const workersRemaining =
          job.workersRequired !== null &&
          job.workersRequired !== undefined

            ? Math.max(

                0,

                Number(
                  job.workersRequired
                ) -
                Number(
                  job.workersFilled ||
                  0
                )

              )

            : null;


        /* ===================================================
           PUBLIC RESPONSE

           IMPORTANT:
           Contractor name/mobile NEVER
           sent here.
        =================================================== */

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

          matchDetails: {

            qualification:
              qualificationMatched,

            trade:
              tradeMatched,

            location:
              locationMatched,

            gender:
              genderMatched,

            experience:
              experienceMatched,

            preferredJob:
              preferredJob
                ? preferredJobMatched
                : null

          },

          matchedSkills

        });

      }


      /* =====================================================
         SORT

         100% match first
         then latest job
      ===================================================== */

      results.sort(
        (a, b) => {

          const scoreDifference =
            Number(
              b.matchScore || 0
            ) -
            Number(
              a.matchScore || 0
            );


          if (
            scoreDifference !== 0
          ) {

            return scoreDifference;

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
          "Failed to search jobs.",

        error:
          error.message

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
        req.body || {};


      const workerMobile =
        normalizeMobile(
          b.workerMobile
        );


      /* =====================================================
         VALIDATION
      ===================================================== */

      if (
        !b.workerName ||
        !/^\d{10}$/.test(
          workerMobile
        ) ||
        !b.jobId
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Worker name, valid mobile and job are required"

        });

      }


      /* =====================================================
         GET JOB
      ===================================================== */

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
        job.status ===
          "Closed" ||
        job.isClosedByAdmin ===
          true
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This job is closed"

        });

      }


      /* =====================================================
         VACANCY
      ===================================================== */

      if (
        job.workersRequired !== null &&
        job.workersRequired !== undefined &&
        Number(
          job.workersFilled || 0
        ) >=
          Number(
            job.workersRequired
          )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "No vacancy remaining"

        });

      }


      /* =====================================================
         CONTRACTOR
      ===================================================== */

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
        contractor.isActive ===
          false
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


      /* =====================================================
         DUPLICATE REQUEST
      ===================================================== */

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


      /* =====================================================
         TRACKING TOKEN
      ===================================================== */

      const trackingToken =
        generateTrackingToken();


      /* =====================================================
         SKILLS
      ===================================================== */

      const skills =
        Array.isArray(
          b.skills
        )

          ? b.skills

          : String(
              b.skills ||
              ""
            )
              .split(",")
              .map(
                x =>
                  x.trim()
              )
              .filter(Boolean);


      /* =====================================================
         CREATE REQUEST
      ===================================================== */

      const request =
        await PublicWorkerRequest.create({

          workerName:
            String(
              b.workerName
            ).trim(),

          workerMobile,

          qualification:
            b.qualification ||
            "",

          trade:
            b.trade ||
            "",

          experience:
            Number(
              b.experience ||
              0
            ),

          skills,

          preferredJob:
            b.preferredJob ||
            "",

          preferredLocation:
            b.preferredLocation ||
            "",

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

        success:
          true,

        status:
          request.status,

        workerName:
          request.workerName,

        workerMobile:
          request.workerMobile,

        job:
          request.jobId

      };


      /* =====================================================
         CONTRACTOR DETAILS ONLY AFTER ACCEPTED
      ===================================================== */

      if (
        request.status ===
        "Accepted"
      ) {

        response.contractor = {

          contractorName:
            request.contractorId
              ?.contractorName ||
            "",

          mobile:
            request.contractorId
              ?.mobile ||
            ""

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


/* =========================================================
   EXPORT
========================================================= */

module.exports =
  router;
