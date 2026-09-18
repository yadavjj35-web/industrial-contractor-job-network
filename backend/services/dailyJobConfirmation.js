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

  /*
   * Same contractor + same date:
   * duplicate cycle nahi banana.
   */
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

    /*
     * Agar scheduler ke do ticks accidentally
     * same time par aa gaye aur unique index hit hua,
     * existing cycle dobara fetch kar lo.
     */
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

  /*
   * Pending jobs hain.
   */
  if (
    pending.length > 0
  ) {

    return false;
  }

  /*
   * Already completed.
   */
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

  /*
   * Cycle complete.
   */
  cycle.cycleStatus =
    "Completed";

  cycle.completedAt =
    new Date();

  await cycle.save();

  /*
   * Pending zero hote hi
   * immediately New Job notification.
   */
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
   SEND MAIN 7 PM CONFIRMATION
========================================================= */

async function sendMainConfirmation(
  cycle
) {

  const pending =
    getPendingJobs(
      cycle
    );

  /*
   * No pending jobs.
   */
  if (
    pending.length === 0
  ) {

    await checkCycleCompletion(
      cycle
    );

    return;
  }

  /*
   * 7 PM notification already sent.
   */
  if (
    cycle.lastReminderHour ===
    19
  ) {

    return;
  }

  await createNotification(

    cycle.contractorId,

    "🔔 Job Confirmation",

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
    19;

  await cycle.save();

  console.log(
    "🔔 Main confirmation sent:",
    cycle.contractorId.toString(),
    "Pending:",
    pending.length
  );
}


/* =========================================================
   SEND 8 PM / 9 PM REMINDER
========================================================= */

async function sendReminder(
  cycle,
  hour
) {

  const pending =
    getPendingJobs(
      cycle
    );

  /*
   * Pending zero.
   */
  if (
    pending.length === 0
  ) {

    await checkCycleCompletion(
      cycle
    );

    return;
  }

  /*
   * Same hour already processed.
   */
  if (
    cycle.lastReminderHour ===
    hour
  ) {

    return;
  }

  /*
   * Future stage already processed.
   */
  if (
    cycle.lastReminderHour !== null &&
    cycle.lastReminderHour !== undefined &&
    cycle.lastReminderHour > hour
  ) {

    return;
  }

  await createNotification(

    cycle.contractorId,

    "🔔 Job Confirmation Reminder",

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
    "🔔 Reminder sent:",
    cycle.contractorId.toString(),
    "Hour:",
    hour,
    "Pending:",
    pending.length
  );
}


/* =========================================================
   10 PM FINAL REMINDER + DELETE
========================================================= */

async function runFinalConfirmation(
  cycle
) {

  let pending =
    getPendingJobs(
      cycle
    );

  /*
   * Already resolved.
   */
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

      "🚨 Final Job Confirmation",

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
      "🚨 Final reminder sent:",
      cycle.contractorId.toString(),
      "Pending:",
      pending.length
    );
  }

  /*
   * 10 PM ke baad saare pending jobs delete.
   */
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
        "🗑️ Pending job deleted:",
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

  /*
   * Pending zero hone ke baad
   * immediately New Job notification.
   */
  await checkCycleCompletion(
    cycle
  );

  console.log(
    "✅ 10 PM final process completed:",
    cycle.contractorId.toString()
  );
}


/* =========================================================
   START TODAY'S CYCLE
   ONLY FOR 7 PM MAIN PROCESS
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

      /*
       * Already completed.
       */
      if (
        cycle.cycleStatus ===
        "Completed"
      ) {

        continue;
      }

      await sendMainConfirmation(
        cycle
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
   ENSURE EXISTING TODAY CYCLES
   FOR 8 PM / 9 PM / 10 PM RECOVERY
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
   RUN PENDING REMINDER
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

      /*
       * 10 PM:
       * Final reminder + delete.
       */
      if (
        hour === 22
      ) {

        await runFinalConfirmation(
          cycle
        );

        continue;
      }

      const pending =
        getPendingJobs(
          cycle
        );

      /*
       * Pending zero.
       */
      if (
        pending.length === 0
      ) {

        await checkCycleCompletion(
          cycle
        );

        continue;
      }

      /*
       * 8 PM / 9 PM.
       */
      await sendReminder(
        cycle,
        hour
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

  /*
   * Already answered.
   */
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

  /*
   * Pending zero hote hi
   * immediate New Job notification.
   */
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

  /*
   * Already answered.
   */
  if (
    item.status !==
    "Pending"
  ) {

    return cycle;
  }

  /*
   * CLOSE = actual job delete.
   */
  await Job.deleteOne({

    _id: jobId,

    contractorId

  });

  item.status =
    "Closed";

  item.respondedAt =
    new Date();

  await cycle.save();

  /*
   * Pending zero hote hi
   * immediate New Job notification.
   */
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

  /*
   * Previous tick abhi running hai.
   * Doosra tick start nahi hoga.
   */
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

    const hour =
      getIndiaHour();


    /* =====================================================
       BEFORE 7 PM
    ===================================================== */

    if (
      hour < 19
    ) {

      return;
    }


    /* =====================================================
       7 PM
    ===================================================== */

    if (
      hour === 19
    ) {

      /*
       * 7 PM par cycle create + main notification.
       */
      await runMainConfirmation();

      return;
    }


    /* =====================================================
       8 PM
    ===================================================== */

    if (
      hour === 20
    ) {

      /*
       * Agar 7 PM par server down tha,
       * cycle create karo.
       *
       * IMPORTANT:
       * Yahan main 7 PM notification nahi bhejenge.
       * Sirf cycle create hoga.
       */
      await ensureTodayCycles();

      /*
       * Ab sirf 8 PM pending reminder.
       */
      await runPendingReminder(20);

      return;
    }


    /* =====================================================
       9 PM
    ===================================================== */

    if (
      hour === 21
    ) {

      /*
       * Recovery ke liye cycle ensure.
       */
      await ensureTodayCycles();

      /*
       * Sirf 9 PM reminder.
       */
      await runPendingReminder(21);

      return;
    }


    /* =====================================================
       10 PM+
    ===================================================== */

    if (
      hour >= 22
    ) {

      /*
       * Recovery:
       * Existing cycle ho to use process karo.
       *
       * Agar cycle missing hai to current active jobs
       * ko today's cycle mein register karenge aur
       * 10 PM final process hoga.
       */
      await ensureTodayCycles();

      /*
       * Final reminder + pending jobs delete.
       */
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
    "🕐 Daily Job Scheduler Started - IST"
  );


  /*
   * Server start hote hi ek baar check.
   *
   * Isse restart ke baad current stage recover hogi.
   */
  runSchedulerTick()
    .catch(error => {

      console.error(
        "INITIAL SCHEDULER ERROR:",
        error
      );

    });


  /*
   * Har 1 minute scheduler check.
   *
   * Render Cron ki zarurat nahi.
   */
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
