const DailyJobConfirmation = require(
  "../models/DailyJobConfirmation"
);

const Job = require(
  "../models/JobRequirement"
);

const Contractor = require(
  "../models/Contractor"
);

const {
  createNotification
} = require(
  "../routes/notificationRoutes"
);


/* =========================================================
   TEST MODE
========================================================= */

const TEST_MODE =
  String(process.env.TEST_MODE).toLowerCase() === "true";

/*
 * TEST FLOW:
 *
 * 0 min  = Main confirmation
 * +2 min = Reminder
 * +4 min = Reminder
 * +6 min = Final + pending jobs delete
 *
 * TEST MODE false hone par normal:
 *
 * 7 PM  = Main confirmation
 * 8 PM  = Reminder
 * 9 PM  = Reminder
 * 10 PM = Final + delete
 */

const TEST_REMINDER_MINUTES = [
  2,
  4
];

const TEST_FINAL_MINUTES = 6;

let testCycleStartedAt = null;


/* =========================================================
   INDIA DATE
========================================================= */

function getIndiaDate() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

  const year =
    parts.find(
      p => p.type === "year"
    ).value;

  const month =
    parts.find(
      p => p.type === "month"
    ).value;

  const day =
    parts.find(
      p => p.type === "day"
    ).value;

  return `${year}-${month}-${day}`;
}


/* =========================================================
   CURRENT INDIA HOUR
========================================================= */

function getIndiaHour() {

  const hour =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hour12: false
      }
    ).format(new Date());

  return Number(hour);
}


/* =========================================================
   GET ACTIVE JOBS
========================================================= */

async function getActiveJobs(
  contractorId
) {

  return Job.find({

    contractorId,

    status: {
      $in: [
        "Active",
        "Partially Filled"
      ]
    },

    isClosedByAdmin: false

  }).select(
    "_id jobTitle companyName companyLocation"
  );
}


/* =========================================================
   CREATE DAILY CYCLE
========================================================= */

async function startDailyCycleForContractor(
  contractorId,
  date
) {

  let cycle =
    await DailyJobConfirmation.findOne({
      contractorId,
      confirmationDate: date
    });

  if (cycle) {

    return cycle;
  }

  const jobs =
    await getActiveJobs(
      contractorId
    );

  try {

    cycle =
      await DailyJobConfirmation.create({

        contractorId,

        confirmationDate:
          date,

        jobs:
          jobs.map(job => ({
            jobId: job._id,
            status: "Pending"
          })),

        cycleStatus:
          "Active"

      });

    return cycle;

  } catch (error) {

    if (
      error &&
      error.code === 11000
    ) {

      return DailyJobConfirmation.findOne({
        contractorId,
        confirmationDate: date
      });

    }

    throw error;
  }
}


/* =========================================================
   GET PENDING JOBS
========================================================= */

function getPendingJobs(
  cycle
) {

  return cycle.jobs.filter(
    item =>
      item.status === "Pending"
  );
}


/* =========================================================
   SEND NEW JOB NOTIFICATION
========================================================= */

async function sendNewJobNotification(
  contractorId,
  cycle
) {

  if (
    cycle.newJobNotificationSent
  ) {

    return;
  }

  await createNotification(

    contractorId,

    "🆕 New Job Requirement?",

    "Kya aapko koi nayi job requirement add karni hai?",

    "NewJob",

    null,

    null

  );

  cycle.newJobNotificationSent =
    true;

  await cycle.save();

  console.log(
    "🆕 New Job notification sent:",
    contractorId.toString()
  );
}


/* =========================================================
   CHECK CYCLE COMPLETION
========================================================= */

async function checkCycleCompletion(
  cycle
) {

  const pending =
    getPendingJobs(
      cycle
    );

  if (
    pending.length > 0
  ) {

    return false;
  }

  if (
    cycle.cycleStatus ===
    "Completed"
  ) {

    if (
      !cycle.newJobNotificationSent
    ) {

      await sendNewJobNotification(
        cycle.contractorId,
        cycle
      );
    }

    return true;
  }

  cycle.cycleStatus =
    "Completed";

  cycle.completedAt =
    new Date();

  await cycle.save();

  await sendNewJobNotification(
    cycle.contractorId,
    cycle
  );

  console.log(
    "✅ Daily cycle completed:",
    cycle.contractorId.toString()
  );

  return true;
}


/* =========================================================
   SEND MAIN CONFIRMATION
========================================================= */

async function sendMainConfirmation(
  cycle,
  testMode = false
) {

  const pending =
    getPendingJobs(
      cycle
    );

  if (
    pending.length === 0
  ) {

    await checkCycleCompletion(
      cycle
    );

    return;
  }

  /*
   * Test mode mein first confirmation
   * sirf ek baar.
   */
  if (
    testMode &&
    cycle.lastReminderHour === -1
  ) {

    return;
  }

  /*
   * Normal 7 PM
   */
  if (
    !testMode &&
    cycle.lastReminderHour === 19
  ) {

    return;
  }

  await createNotification(

    cycle.contractorId,

    testMode
      ? "🧪 TEST - Job Confirmation"
      : "🔔 Job Confirmation",

    `${pending.length} job requirement${
      pending.length > 1
        ? "s are"
        : " is"
    } pending. Please confirm OPEN or CLOSE.`,

    "JobConfirmation",

    null,

    null

  );

  cycle.lastReminderHour =
    testMode
      ? -1
      : 19;

  await cycle.save();

  console.log(
    testMode
      ? "🧪 TEST confirmation sent:"
      : "🔔 Main confirmation sent:",
    cycle.contractorId.toString(),
    "Pending:",
    pending.length
  );
}


/* =========================================================
   SEND REMINDER
========================================================= */

async function sendReminder(
  cycle,
  hour,
  testMode = false
) {

  const pending =
    getPendingJobs(
      cycle
    );

  if (
    pending.length === 0
  ) {

    await checkCycleCompletion(
      cycle
    );

    return;
  }

  if (
    cycle.lastReminderHour ===
    hour
  ) {

    return;
  }

  if (
    !testMode &&
    cycle.lastReminderHour !== null &&
    cycle.lastReminderHour !== undefined &&
    cycle.lastReminderHour > hour
  ) {

    return;
  }

  await createNotification(

    cycle.contractorId,

    testMode
      ? "🧪 TEST - Job Confirmation Reminder"
      : "🔔 Job Confirmation Reminder",

    `${pending.length} job requirement${
      pending.length > 1
        ? "s are"
        : " is"
    } still pending. Please confirm OPEN or CLOSE.`,

    "JobConfirmation",

    null,

    null

  );

  cycle.lastReminderHour =
    hour;

  await cycle.save();

  console.log(
    testMode
      ? "🧪 TEST reminder sent:"
      : "🔔 Reminder sent:",
    cycle.contractorId.toString(),
    "Stage:",
    hour,
    "Pending:",
    pending.length
  );
}


/* =========================================================
   FINAL REMINDER + DELETE
========================================================= */

async function runFinalConfirmation(
  cycle,
  testMode = false
) {

  let pending =
    getPendingJobs(
      cycle
    );

  if (
    pending.length === 0
  ) {

    await checkCycleCompletion(
      cycle
    );

    return;
  }

  /*
   * Final notification only once.
   */
  if (
    cycle.lastReminderHour !==
    22
  ) {

    await createNotification(

      cycle.contractorId,

      testMode
        ? "🧪 TEST - Final Job Confirmation"
        : "🚨 Final Job Confirmation",

      `${pending.length} job requirement${
        pending.length > 1
          ? "s are"
          : " is"
      } still pending. This is the final reminder.`,

      "JobConfirmation",

      null,

      null

    );

    cycle.lastReminderHour =
      22;

    await cycle.save();

    console.log(
      testMode
        ? "🧪 TEST final reminder sent:"
        : "🚨 Final reminder sent:",
      cycle.contractorId.toString(),
      "Pending:",
      pending.length
    );
  }

  /*
   * IMPORTANT:
   *
   * Pending jobs actual database se delete hongi.
   */
  pending =
    getPendingJobs(
      cycle
    );

  for (
    const item of pending
  ) {

    try {

      await Job.deleteOne({

        _id:
          item.jobId,

        contractorId:
          cycle.contractorId

      });

      item.status =
        "Closed";

      item.respondedAt =
        new Date();

      console.log(
        testMode
          ? "🧪 TEST - Job deleted:"
          : "🗑️ Pending job deleted:",
        item.jobId.toString()
      );

    } catch (deleteError) {

      console.error(
        "JOB DELETE ERROR:",
        item.jobId.toString(),
        deleteError
      );
    }
  }

  await cycle.save();

  await checkCycleCompletion(
    cycle
  );

  console.log(
    testMode
      ? "🧪 TEST final process completed:"
      : "✅ 10 PM final process completed:",
    cycle.contractorId.toString()
  );
}


/* =========================================================
   NORMAL 7 PM PROCESS
========================================================= */

async function runMainConfirmation() {

  const date =
    getIndiaDate();

  console.log(
    "======================================"
  );

  console.log(
    "DAILY JOB CONFIRMATION:",
    date
  );

  const contractors =
    await Contractor.find({
      isActive: true
    }).select("_id");

  for (
    const contractor of contractors
  ) {

    try {

      const cycle =
        await startDailyCycleForContractor(
          contractor._id,
          date
        );

      if (
        cycle.cycleStatus ===
        "Completed"
      ) {

        continue;
      }

      await sendMainConfirmation(
        cycle,
        false
      );

    } catch (error) {

      console.error(
        "MAIN CONFIRMATION ERROR:",
        contractor._id,
        error
      );
    }
  }

  console.log(
    "======================================"
  );
}


/* =========================================================
   ENSURE TODAY'S CYCLES
========================================================= */

async function ensureTodayCycles() {

  const date =
    getIndiaDate();

  const contractors =
    await Contractor.find({
      isActive: true
    }).select("_id");

  for (
    const contractor of contractors
  ) {

    try {

      await startDailyCycleForContractor(
        contractor._id,
        date
      );

    } catch (error) {

      console.error(
        "ENSURE TODAY CYCLE ERROR:",
        contractor._id,
        error
      );
    }
  }
}


/* =========================================================
   NORMAL PENDING REMINDER
========================================================= */

async function runPendingReminder(
  hour
) {

  const date =
    getIndiaDate();

  const cycles =
    await DailyJobConfirmation.find({

      confirmationDate:
        date,

      cycleStatus:
        "Active"

    });

  for (
    const cycle of cycles
  ) {

    try {

      if (
        hour === 22
      ) {

        await runFinalConfirmation(
          cycle,
          false
        );

        continue;
      }

      const pending =
        getPendingJobs(
          cycle
        );

      if (
        pending.length === 0
      ) {

        await checkCycleCompletion(
          cycle
        );

        continue;
      }

      await sendReminder(
        cycle,
        hour,
        false
      );

    } catch (error) {

      console.error(
        "PENDING REMINDER ERROR:",
        error
      );
    }
  }
}


/* =========================================================
   TEST MODE
========================================================= */

async function runTestScheduler() {

  /*
   * Server restart hone par test timer reset hoga.
   * TEST_MODE sirf temporary testing ke liye hai.
   */
  if (
    !testCycleStartedAt
  ) {

    testCycleStartedAt =
      Date.now();

    console.log(
      "🧪 TEST MODE STARTED"
    );
  }

  const elapsedMinutes =
    Math.floor(
      (
        Date.now() -
        testCycleStartedAt
      ) /
      60000
    );

  console.log(
    `🧪 TEST MODE: +${elapsedMinutes} minute`
  );

  const date =
    getIndiaDate();

  const contractors =
    await Contractor.find({
      isActive: true
    }).select("_id");

  /*
   * 0 minute:
   * Main confirmation.
   */
  if (
    elapsedMinutes === 0
  ) {

    for (
      const contractor of contractors
    ) {

      try {

        const cycle =
          await startDailyCycleForContractor(
            contractor._id,
            date
          );

        if (
          cycle.cycleStatus ===
          "Completed"
        ) {

          continue;
        }

        await sendMainConfirmation(
          cycle,
          true
        );

      } catch (error) {

        console.error(
          "TEST MAIN ERROR:",
          contractor._id,
          error
        );
      }
    }

    return;
  }

  /*
   * +2 minutes
   */
  if (
    elapsedMinutes >= 2 &&
    elapsedMinutes < 4
  ) {

    await ensureTodayCycles();

    const cycles =
      await DailyJobConfirmation.find({

        confirmationDate:
          date,

        cycleStatus:
          "Active"

      });

    for (
      const cycle of cycles
    ) {

      await sendReminder(
        cycle,
        2,
        true
      );
    }

    return;
  }

  /*
   * +4 minutes
   */
  if (
    elapsedMinutes >= 4 &&
    elapsedMinutes < TEST_FINAL_MINUTES
  ) {

    await ensureTodayCycles();

    const cycles =
      await DailyJobConfirmation.find({

        confirmationDate:
          date,

        cycleStatus:
          "Active"

      });

    for (
      const cycle of cycles
    ) {

      await sendReminder(
        cycle,
        4,
        true
      );
    }

    return;
  }

  /*
   * +6 minutes:
   * Final + delete.
   */
  if (
    elapsedMinutes >=
    TEST_FINAL_MINUTES
  ) {

    await ensureTodayCycles();

    const cycles =
      await DailyJobConfirmation.find({

        confirmationDate:
          date,

        cycleStatus:
          "Active"

      });

    for (
      const cycle of cycles
    ) {

      await runFinalConfirmation(
        cycle,
        true
      );
    }

    /*
     * Test complete.
     */
    console.log(
      "======================================"
    );

    console.log(
      "🧪 TEST MODE COMPLETED"
    );

    console.log(
      "Set TEST_MODE=false after testing."
    );

    console.log(
      "======================================"
    );
  }
}


/* =========================================================
   OPEN JOB
========================================================= */

async function confirmJobOpen(
  contractorId,
  jobId
) {

  const date =
    getIndiaDate();

  const cycle =
    await DailyJobConfirmation.findOne({

      contractorId,

      confirmationDate:
        date,

      cycleStatus:
        "Active"

    });

  if (!cycle) {

    throw new Error(
      "Today's confirmation cycle not found"
    );
  }

  const item =
    cycle.jobs.find(
      job =>
        String(job.jobId) ===
        String(jobId)
    );

  if (!item) {

    throw new Error(
      "Job is not part of today's confirmation"
    );
  }

  if (
    item.status !==
    "Pending"
  ) {

    return cycle;
  }

  const job =
    await Job.findOne({

      _id: jobId,

      contractorId

    });

  if (!job) {

    item.status =
      "Closed";

  } else {

    item.status =
      "Open";
  }

  item.respondedAt =
    new Date();

  await cycle.save();

  await checkCycleCompletion(
    cycle
  );

  return cycle;
}


/* =========================================================
   CLOSE + DELETE JOB
========================================================= */

async function confirmJobClose(
  contractorId,
  jobId
) {

  const date =
    getIndiaDate();

  const cycle =
    await DailyJobConfirmation.findOne({

      contractorId,

      confirmationDate:
        date,

      cycleStatus:
        "Active"

    });

  if (!cycle) {

    throw new Error(
      "Today's confirmation cycle not found"
    );
  }

  const item =
    cycle.jobs.find(
      job =>
        String(job.jobId) ===
        String(jobId)
    );

  if (!item) {

    throw new Error(
      "Job is not part of today's confirmation"
    );
  }

  if (
    item.status !==
    "Pending"
  ) {

    return cycle;
  }

  await Job.deleteOne({

    _id: jobId,

    contractorId

  });

  item.status =
    "Closed";

  item.respondedAt =
    new Date();

  await cycle.save();

  await checkCycleCompletion(
    cycle
  );

  return cycle;
}


/* =========================================================
   SCHEDULER LOCK
========================================================= */

let schedulerStarted =
  false;

let schedulerRunning =
  false;


/* =========================================================
   RUN ONE SCHEDULER TICK
========================================================= */

async function runSchedulerTick() {

  if (
    schedulerRunning
  ) {

    console.log(
      "⏳ Scheduler tick already running"
    );

    return;
  }

  schedulerRunning =
    true;

  try {

    /*
     * =====================================================
     * TEST MODE
     * =====================================================
     */

    if (
      TEST_MODE
    ) {

      await runTestScheduler();

      return;
    }


    /*
     * =====================================================
     * NORMAL PRODUCTION MODE
     * =====================================================
     */

    const hour =
      getIndiaHour();


    if (
      hour < 19
    ) {

      return;
    }


    if (
      hour === 19
    ) {

      await runMainConfirmation();

      return;
    }


    if (
      hour === 20
    ) {

      await ensureTodayCycles();

      await runPendingReminder(20);

      return;
    }


    if (
      hour === 21
    ) {

      await ensureTodayCycles();

      await runPendingReminder(21);

      return;
    }


    if (
      hour >= 22
    ) {

      await ensureTodayCycles();

      await runPendingReminder(22);

      return;
    }

  } catch (error) {

    console.error(
      "SCHEDULER TICK ERROR:",
      error
    );

  } finally {

    schedulerRunning =
      false;
  }
}


/* =========================================================
   START DAILY JOB SCHEDULER
========================================================= */

function startDailyJobScheduler() {

  if (
    schedulerStarted
  ) {

    console.log(
      "🕐 Daily Job Scheduler already running"
    );

    return;
  }

  schedulerStarted =
    true;

  console.log(
    TEST_MODE
      ? "🧪 Daily Job Scheduler Started - TEST MODE"
      : "🕐 Daily Job Scheduler Started - IST"
  );

  runSchedulerTick()
    .catch(error => {

      console.error(
        "INITIAL SCHEDULER ERROR:",
        error
      );

    });

  setInterval(
    async () => {

      await runSchedulerTick();

    },
    60 * 1000
  );
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  getIndiaDate,

  startDailyJobScheduler,

  runMainConfirmation,

  runPendingReminder,

  confirmJobOpen,

  confirmJobClose,

  runSchedulerTick

};
