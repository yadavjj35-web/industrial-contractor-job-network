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

  return Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hour12: false
      }
    )
      .format(new Date())
  );
}


/* =========================================================
   CURRENT INDIA MINUTE
   ========================================================= */

function getIndiaMinute() {

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).formatToParts(new Date());

  const minute =
    parts.find(
      p => p.type === "minute"
    ).value;

  return Number(minute);
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
   * Already created.
   * Duplicate cycle nahi banana.
   */
  if (cycle) {

    return cycle;
  }

  const jobs =
    await getActiveJobs(
      contractorId
    );

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
   NEW JOB NOTIFICATION
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
   * Abhi jobs pending hain.
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

    /*
     * Safety:
     * Agar kisi reason se New Job notification
     * save nahi hui ho to dobara try kar sakte hain.
     */
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

  if (
    pending.length === 0
  ) {

    await checkCycleCompletion(
      cycle
    );

    return;
  }

  /*
   * lastReminderHour ko 19 use kar rahe hain
   * taaki 7 PM confirmation duplicate na ho.
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

    "JobConfirmation"

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
   SEND NORMAL REMINDER
   ========================================================= */

async function sendReminder(
  cycle,
  hour
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
   * Same hour ka reminder dobara nahi.
   */
  if (
    cycle.lastReminderHour ===
    hour
  ) {

    return;
  }

  /*
   * Agar last stage already future mein process ho chuki hai,
   * duplicate nahi bhejna.
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

    "JobConfirmation"

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
   * 10 PM final notification
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

      "JobConfirmation"

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
   * 10 PM ke baad response ka wait nahi.
   * Saare pending jobs delete.
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

    } catch (
      deleteError
    ) {

      console.error(
        "JOB DELETE ERROR:",
        item.jobId.toString(),
        deleteError
      );
    }
  }

  await cycle.save();

  /*
   * Ab pending zero hona chahiye.
   * Iske turant baad New Job notification.
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
   7 PM MAIN CONFIRMATION
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
       * Agar already completed hai,
       * kuch nahi karna.
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
   HOURLY PENDING REMINDER
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
       * Agar 10 PM hai to final process.
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
       * Pending zero:
       * No reminder.
       * Immediately complete.
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
       * 8 PM / 9 PM reminder
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

  if (
    item.status !==
    "Pending"
  ) {

    return cycle;
  }

  /*
   * Check job still exists.
   */
  const job =
    await Job.findOne({

      _id: jobId,

      contractorId

    });

  if (!job) {

    item.status =
      "Closed";

    item.respondedAt =
      new Date();

  } else {

    item.status =
      "Open";

    item.respondedAt =
      new Date();
  }

  await cycle.save();

  /*
   * Pending zero hote hi
   * New Job notification.
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

  if (
    item.status !==
    "Pending"
  ) {

    return cycle;
  }

  /*
   * Contractor CLOSE karta hai:
   * actual job MongoDB se delete.
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
   * Pending zero hone par
   * immediately New Job notification.
   */
  await checkCycleCompletion(
    cycle
  );

  return cycle;
}


/* =========================================================
   RESTART-SAFE SCHEDULER
   ========================================================= */

/*
 * Important:
 *
 * Server restart ke baad scheduler current IST time
 * ke according missed stage recover karega.
 *
 * Example:
 *
 * Server OFF:
 * 7:00 PM
 *
 * Server ON:
 * 8:30 PM
 *
 * System database se today's cycle dekhega
 * aur required current stage process karega.
 */

let schedulerStarted =
  false;


/* =========================================================
   RUN ONE SCHEDULER TICK
   ========================================================= */

async function runSchedulerTick() {

  try {

    const hour =
      getIndiaHour();

    const date =
      getIndiaDate();

    /*
     * 7 PM se pehle:
     * kuch nahi.
     */
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
       * Safety:
       * Agar 7 PM server down tha,
       * pehle today's cycle create karo.
       */
      await runMainConfirmation();

      /*
       * Uske baad 8 PM reminder.
       */
      await runPendingReminder(
        20
      );

      return;
    }


    /* =====================================================
       9 PM
       ===================================================== */

    if (
      hour === 21
    ) {

      /*
       * Safety:
       * Agar 7/8 PM miss hua ho,
       * cycle ensure karo.
       */
      await runMainConfirmation();

      await runPendingReminder(
        21
      );

      return;
    }


    /* =====================================================
       10 PM OR AFTER
       ===================================================== */

    if (
      hour >= 22
    ) {

      /*
       * Safety:
       * Agar server poore din down tha
       * aur 10 PM ke baad start hua,
       * today's cycle create karo.
       */
      await runMainConfirmation();

      /*
       * Final reminder + delete.
       */
      await runPendingReminder(
        22
      );

      return;
    }

  } catch (error) {

    console.error(
      "SCHEDULER TICK ERROR:",
      error
    );
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
   * IMPORTANT:
   *
   * Server start hote hi ek baar check.
   *
   * Isse restart ke baad missed stage recover ho sakti hai.
   */
  runSchedulerTick()
    .catch(error => {

      console.error(
        "INITIAL SCHEDULER ERROR:",
        error
      );

    });


  /*
   * Uske baad har 1 minute check.
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
