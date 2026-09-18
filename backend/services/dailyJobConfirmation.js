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

function getPendingJobs(cycle) {

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
    getPendingJobs(cycle);

  if (pending.length > 0) {

    return false;
  }

  /*
   * Already completed
   */
  if (
    cycle.cycleStatus ===
    "Completed"
  ) {

    return true;
  }

  cycle.cycleStatus =
    "Completed";

  cycle.completedAt =
    new Date();

  await cycle.save();

  /*
   * IMPORTANT:
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
       * Already started.
       */
      if (
        cycle.cycleStatus !==
        "Active"
      ) {
        continue;
      }

      const pending =
        getPendingJobs(cycle);

      /*
       * No active/pending jobs.
       * Immediately New Job notification.
       */
      if (
        pending.length === 0
      ) {

        await checkCycleCompletion(
          cycle
        );

        continue;
      }

      await createNotification(

        contractor._id,

        "🔔 Job Confirmation",

        `${pending.length} job requirement${
          pending.length > 1
            ? "s are"
            : " is"
        } pending. Please confirm OPEN or CLOSE.`,

        "JobConfirmation"

      );

      console.log(
        "🔔 Main confirmation sent:",
        contractor._id.toString(),
        "Pending:",
        pending.length
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

      const pending =
        getPendingJobs(cycle);

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
       * Reminder already sent
       * for this hour.
       */
      if (
        cycle.lastReminderHour ===
        hour
      ) {

        continue;
      }

      const isFinal =
        hour === 22;

      const title =
        isFinal
          ? "🚨 Final Job Confirmation"
          : "🔔 Job Confirmation Reminder";

      const message =
        isFinal

          ? `${pending.length} job requirement${
              pending.length > 1
                ? "s are"
                : " is"
            } still pending. This is the final reminder.`

          : `${pending.length} job requirement${
              pending.length > 1
                ? "s are"
                : " is"
            } still pending. Please confirm OPEN or CLOSE.`;

      await createNotification(

        cycle.contractorId,

        title,

        message,

        "JobConfirmation"

      );

      cycle.lastReminderHour =
        hour;

      await cycle.save();

      console.log(
        isFinal
          ? "🚨 Final reminder sent"
          : "🔔 Reminder sent",

        cycle.contractorId.toString(),

        "Pending:",
        pending.length
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
      confirmationDate: date,
      cycleStatus: "Active"
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
    item.status !== "Pending"
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
      confirmationDate: date,
      cycleStatus: "Active"
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
    item.status !== "Pending"
  ) {

    return cycle;
  }

  /*
   * IMPORTANT:
   * Contractor ke CLOSE karte hi
   * actual Job delete.
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

  await checkCycleCompletion(
    cycle
  );

  return cycle;
}


/* =========================================================
   SCHEDULER
   ========================================================= */

let schedulerStarted =
  false;

function startDailyJobScheduler() {

  if (schedulerStarted) {
    return;
  }

  schedulerStarted =
    true;

  console.log(
    "🕐 Daily Job Scheduler Started - IST"
  );

  /*
   * Har 1 minute check.
   *
   * Exact notification sirf ek baar
   * particular hour/date par chalegi.
   */
  setInterval(
    async () => {

      try {

        const hour =
          getIndiaHour();

        const minute =
          new Date(
            new Date().toLocaleString(
              "en-US",
              {
                timeZone:
                  "Asia/Kolkata"
              }
            )
          ).getMinutes();

        /*
         * Sirf exact hour ke first 2 minutes
         * mein trigger.
         *
         * Duplicate protection database
         * ke through.
         */

        if (
          minute > 1
        ) {
          return;
        }

        /*
         * 7 PM
         */
        if (
          hour === 19
        ) {

          const date =
            getIndiaDate();

          /*
           * Check if today's cycle
           * already exists.
           */
          const existing =
            await DailyJobConfirmation.findOne({
              confirmationDate: date
            }).limit(1);

          /*
           * Agar cycle exists bhi ho,
           * runMainConfirmation duplicate
           * notification nahi bhejega
           * because individual cycles exist.
           */
          await runMainConfirmation();

          return;
        }

        /*
         * 8 PM
         */
        if (
          hour === 20
        ) {

          await runPendingReminder(
            20
          );

          return;
        }

        /*
         * 9 PM
         */
        if (
          hour === 21
        ) {

          await runPendingReminder(
            21
          );

          return;
        }

        /*
         * 10 PM FINAL
         */
        if (
          hour === 22
        ) {

          await runPendingReminder(
            22
          );

          return;
        }

      } catch (error) {

        console.error(
          "DAILY JOB SCHEDULER ERROR:",
          error
        );

      }

    },
    60 * 1000
  );
}


module.exports = {

  getIndiaDate,

  startDailyJobScheduler,

  runMainConfirmation,

  runPendingReminder,

  confirmJobOpen,

  confirmJobClose

};
