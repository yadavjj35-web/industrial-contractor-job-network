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

text = text.replace(/[.,/\()_:;|]+/g, " ");

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

  const b = req.body || {};


  /* =====================================================
     BASIC VALUES
  ===================================================== */

  const companyName =
    String(
      b.companyName || ""
    ).trim() || "N/A";

  const companyLocation =
    String(
      b.companyLocation || ""
    ).trim();

  const jobTitle =
    String(
      b.jobTitle || ""
    ).trim();

  const qualification =
    String(
      b.qualification || ""
    ).trim();

  const trade =
    String(
      b.trade || ""
    ).trim();


  /* =====================================================
     WORKERS REQUIRED OPTIONAL
  ===================================================== */

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

     ONLY THESE 5 ARE REQUIRED:

     1. Qualification
     2. Trade
     3. Experience
     4. Job Title
     5. Location
  ===================================================== */

  if (!jobTitle) {

    return res.status(400).json({
      success: false,
      message:
        "Job title is required"
    });

  }

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

  if (!companyLocation) {

    return res.status(400).json({
      success: false,
      message:
        "Location is required"
    });

  }


  /* =====================================================
     EXPERIENCE
  ===================================================== */

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


  const experienceMax =
    b.experienceMax === "" ||
    b.experienceMax === undefined ||
    b.experienceMax === null
      ? 99
      : Number(
          b.experienceMax
        );


  if (
    Number.isNaN(
      experienceMax
    ) ||
    experienceMax < experienceMin
  ) {

    return res.status(400).json({
      success: false,
      message:
        "Invalid maximum experience"
    });

  }


  /* =====================================================
     WORKERS REQUIRED VALIDATION
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
      String(
        b.gender || ""
      )
    )
      ? String(
          b.gender
        )
      : "Any";


  /* =====================================================
     SALARY
  ===================================================== */

  const salaryMin =
    b.salaryMin === "" ||
    b.salaryMin === null ||
    b.salaryMin === undefined
      ? 0
      : Number(
          b.salaryMin
        );

  const salaryMax =
    b.salaryMax === "" ||
    b.salaryMax === null ||
    b.salaryMax === undefined
      ? 0
      : Number(
          b.salaryMax
        );


  if (
    Number.isNaN(salaryMin) ||
    salaryMin < 0
  ) {

    return res.status(400).json({
      success: false,
      message:
        "Invalid minimum salary"
    });

  }

  if (
    Number.isNaN(salaryMax) ||
    salaryMax < 0
  ) {

    return res.status(400).json({
      success: false,
      message:
        "Invalid maximum salary"
    });

  }


  /* =====================================================
     SKILLS
  ===================================================== */

  const skills =
    splitSkills(
      b.skills
    );


  /* =====================================================
     CREATE JOB
  ===================================================== */

  const job =
    await Job.create({

      ...b,

      contractorId:
        req.contractorId,

      companyName,

      companyLocation,

      jobTitle,

      qualification,

      trade,

      workersRequired,

      gender,

      experienceMin,

      experienceMax,

      salaryMin,

      salaryMax,

      skills

    });


  /* =====================================================
     USAGE
  ===================================================== */

  await increaseUsage(req);


  /* =====================================================
     SUCCESS RESPONSE
  ===================================================== */

  return res.status(201).json({

    success: true,

    message:
      "Job requirement created successfully",

    job

  });

} catch (err) {

  console.error(
    "CREATE JOB ERROR:",
    err
  );


  /* =====================================================
     MONGOOSE VALIDATION ERROR
  ===================================================== */

  if (
    err &&
    err.name ===
      "ValidationError"
  ) {

    const validationMessages =
      Object.values(
        err.errors || {}
      )
      .map(
        item =>
          item.message
      )
      .join(", ");

    return res.status(400).json({

      success: false,

      message:
        validationMessages ||
        "Job validation failed"

    });

  }


  /* =====================================================
     OTHER ERROR
  ===================================================== */

  return res.status(500).json({

    success: false,

    message:
      err.message ||
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

Qualification = 25%
Trade         = 25%
Location      = 25%
Gender        = 25%

ALL 4 MATCH REQUIRED

Experience, Skills and Preferred Job
do not block the basic matching.
========================================================= */

router.get(
  "/search",
  auth,
  limit("workerSearches"),
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
          req.query.skills || ""
        );


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


      if (
        experienceRaw !== undefined &&
        experienceRaw !== "" &&
        (
          Number.isNaN(experience) ||
          experience < 0
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid experience value."
        });

      }


      const jobs =
        await JobRequirement
          .find({
            status: {
              $in: [
                "Active",
                "Partially Filled"
              ]
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


      const results =
        jobs
          .map(job => {

            if (!job.contractorId) {
              return null;
            }


            if (
              job.contractorId.isActive === false
            ) {
              return null;
            }


            if (
              job.contractorId.verificationStatus &&
              job.contractorId.verificationStatus !==
                "Approved"
            ) {
              return null;
            }


            if (
              String(job.contractorId._id) ===
              String(req.contractorId)
            ) {
              return null;
            }


            if (
              job.workersRequired !== null &&
              job.workersRequired !== undefined &&
              Number(job.workersRequired) > 0 &&
              Number(job.workersFilled || 0) >=
                Number(job.workersRequired)
            ) {
              return null;
            }


            let qualificationScore = 0;
            let tradeScore = 0;
            let locationScore = 0;
            let genderScore = 0;


            if (
              textMatch(
                qualification,
                job.qualification
              )
            ) {
              qualificationScore = 25;
            }


            if (
              textMatch(
                trade,
                job.trade
              )
            ) {
              tradeScore = 25;
            }


            const jobLocation =
              normalizeText(
                [
                  job.companyLocation,
                  job.industrialArea,
                  contractorLocation(
                    job.contractorId
                  )
                ]
                  .filter(Boolean)
                  .join(" ")
              );

            if (
              textMatch(
                location,
                jobLocation
              )
            ) {
              locationScore = 25;
            }


            const jobGender =
              normalizeText(
                job.gender || "Any"
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


            if (genderIsAny) {

              genderScore = 25;

            } else if (
              textMatch(
                gender,
                jobGender
              )
            ) {

              genderScore = 25;

            }


            let preferredJobMatch = true;

            if (preferredJob) {

              preferredJobMatch =
                !!job.jobTitle &&
                textMatch(
                  preferredJob,
                  job.jobTitle
                );

            }


            if (
              experienceRaw !== undefined &&
              experienceRaw !== ""
            ) {

              const minExperience =
                Number(
                  job.experienceMin || 0
                );

              const maxExperience =
                Number(
                  job.experienceMax ?? 99
                );

              if (
                experience < minExperience ||
                experience > maxExperience
              ) {
                return null;
              }

            }


            if (
              preferredJob &&
              !preferredJobMatch
            ) {
              return null;
            }


            if (
              qualificationScore !== 25 ||
              tradeScore !== 25 ||
              locationScore !== 25 ||
              genderScore !== 25
            ) {
              return null;
            }


            const score =
              qualificationScore +
              tradeScore +
              locationScore +
              genderScore;


            let matchedSkills = [];

            if (
              workerSkills.length &&
              Array.isArray(job.skills)
            ) {

              matchedSkills =
                workerSkills.filter(
                  workerSkill =>
                    job.skills.some(
                      jobSkill =>
                        textMatch(
                          workerSkill,
                          jobSkill
                        )
                    )
                );

            }


            return {

              ...job.toObject(),

              matchScore:
                score,

              matchDetails: {

                qualification:
                  qualificationScore === 25,

                trade:
                  tradeScore === 25,

                location:
                  locationScore === 25,

                gender:
                  genderScore === 25,

                preferredJob:
                  preferredJob
                    ? preferredJobMatch
                    : null

              },

              matchedSkills,

              workersRemaining:
                job.workersRemaining

            };

          })
          .filter(Boolean);


      results.sort(
        (a, b) => {

          const scoreDifference =
            Number(b.matchScore || 0) -
            Number(a.matchScore || 0);

          if (scoreDifference !== 0) {
            return scoreDifference;
          }

          return (
            new Date(b.createdAt || 0) -
            new Date(a.createdAt || 0)
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


    } catch (error) {

      console.error(
        "JOB SEARCH ERROR:",
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
    req.body || {};

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

    const salaryMin =
      Number(
        b.salaryMin
      );


    if (
      Number.isNaN(salaryMin) ||
      salaryMin < 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid minimum salary"
      });

    }


    updateData.salaryMin =
      salaryMin;

  }


  if (
    b.salaryMax !==
    undefined
  ) {

    const salaryMax =
      Number(
        b.salaryMax
      );


    if (
      Number.isNaN(salaryMax) ||
      salaryMax < 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid maximum salary"
      });

    }


    updateData.salaryMax =
      salaryMax;

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

  if (
    err &&
    err.name ===
      "ValidationError"
  ) {

    const validationMessages =
      Object.values(
        err.errors || {}
      )
      .map(
        item =>
          item.message
      )
      .join(", ");

    return res.status(400).json({

      success: false,

      message:
        validationMessages ||
        "Job validation failed"

    });

  }


  return res.status(500).json({

    success: false,

    message:
      err.message ||
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
