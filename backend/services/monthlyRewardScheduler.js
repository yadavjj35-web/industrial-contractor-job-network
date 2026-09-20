const MonthlyRewardVerification =
  require("../models/MonthlyRewardVerification");

const Referral =
  require("../models/Referral");

const notificationRoutes =
  require("../routes/notificationRoutes");


/* =========================================================
   INDIA TIME HELPERS
========================================================= */

function getIndiaParts(date = new Date()) {

  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Kolkata",

        year: "numeric",
        month: "2-digit",
        day: "2-digit",

        hour: "2-digit",
        minute: "2-digit",

        hour12: false
      }
    );


  const parts =
    formatter.formatToParts(date);


  const result = {};


  parts.forEach(part => {

    if (
      part.type !== "literal"
    ) {

      result[part.type] =
        part.value;

    }

  });


  return result;
}


/* =========================================================
   INDIA DATE STRING
========================================================= */

function getIndiaDateString(date = new Date()) {

  const parts =
    getIndiaParts(date);


  return `${parts.year}-${parts.month}-${parts.day}`;
}


/* =========================================================
   MONTHLY PERIOD

   Verification date:

   15 September

   Period:

   25 July
      ↓
   25 August
========================================================= */

function getRewardPeriod(
  verificationDate = new Date()
) {

  const parts =
    getIndiaParts(
      verificationDate
    );


  const year =
    Number(parts.year);

  const month =
    Number(parts.month);

  const day =
    Number(parts.day);


  /*
   * Verification हमेशा 15 तारीख को होना चाहिए.
   */

  if (day !== 15) {

    throw new Error(
      "Reward verification is allowed only on the 15th."
    );

  }


  /*
   * Period END = पिछले महीने की 25 तारीख
   *
   * 15 Sep
   *   ↓
   * 25 Aug
   */

  let endYear =
    year;

  let endMonth =
    month - 1;


  if (endMonth === 0) {

    endMonth = 12;

    endYear--;

  }


  /*
   * Period START = उससे पिछले महीने की 25 तारीख
   *
   * 25 Jul
   */

  let startYear =
    endYear;

  let startMonth =
    endMonth - 1;


  if (startMonth === 0) {

    startMonth = 12;

    startYear--;

  }


  /*
   * UTC values use 18:30
   * which corresponds to 00:00 IST.
   */

  const periodStart =
    new Date(
      Date.UTC(
        startYear,
        startMonth - 1,
        25,
        18,
        30,
        0
      )
    );


  const periodEnd =
    new Date(
      Date.UTC(
        endYear,
        endMonth - 1,
        25,
        18,
        30,
        0
      )
    );


  const verification =
    new Date(
      Date.UTC(
        year,
        month - 1,
        15,
        18,
        30,
        0
      )
    );


  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];


  const periodLabel =
    `25 ${monthNames[startMonth - 1]} ${startYear} - 25 ${monthNames[endMonth - 1]} ${endYear}`;


  return {

    periodStart,

    periodEnd,

    verificationDate:
      verification,

    periodLabel

  };

}


/* =========================================================
   CREATE RECORDS FOR 25 → 25 PERIOD
========================================================= */

async function generateMonthlyRecords(
  verificationDate = new Date()
) {

  const {

    periodStart,

    periodEnd,

    verificationDate:
      finalVerificationDate,

    periodLabel

  } =
    getRewardPeriod(
      verificationDate
    );


  console.log(
    "========================================"
  );

  console.log(
    "MONTHLY REWARD GENERATION"
  );

  console.log(
    "Period:",
    periodLabel
  );

  console.log(
    "Verification:",
    getIndiaDateString(
      finalVerificationDate
    )
  );

  console.log(
    "========================================"
  );


  /*
   * IMPORTANT:
   *
   * Joined होने के बाद worker की
   * joining date period के अंदर होनी चाहिए.
   *
   * इसलिए सिर्फ Joined status काफी नहीं है.
   */

  const joinedReferrals =
    await Referral.find({

      status:
        "Joined",

      /*
       * Referral का actual joining date
       * period के अंदर होना चाहिए.
       *
       * Existing Referral model में joinedAt
       * उपलब्ध न होने पर updatedAt इस्तेमाल.
       */

      $or: [

        {
          joinedAt: {
            $gte: periodStart,
            $lt: periodEnd
          }
        },

        {
          joinedAt: null,

          updatedAt: {
            $gte: periodStart,
            $lt: periodEnd
          }
        }

      ]

    });


  let created =
    0;

  let skipped =
    0;


  for (
    const referral
    of joinedReferrals
  ) {

    try {

      const joiningDate =
        referral.joinedAt ||
        referral.updatedAt ||
        referral.createdAt;


      /*
       * Safety check.
       */

      if (
        !joiningDate
      ) {

        skipped++;

        continue;

      }


      const existing =
        await MonthlyRewardVerification
          .findOne({

            referralId:
              referral._id,

            periodStart,

            periodEnd

          });


      if (existing) {

        skipped++;

        continue;

      }


      await MonthlyRewardVerification
        .create({

          periodStart,

          periodEnd,

          verificationDate:
            finalVerificationDate,

          periodLabel,

          referralId:
            referral._id,

          referredBy:
            referral.referredBy,

          referredTo:
            referral.referredTo,

          workerName:
            referral.workerName,

          workerMobile:
            referral.workerMobile,

          joiningDate,

          receiverStatus:
            "Pending",

          referrerStatus:
            "Pending",

          finalStatus:
            "Pending",

          rewardPerWorker:
            0,

          rewardAmount:
            0,

          rewardStatus:
            "Pending",

          adminCommissionPercent:
            10,

          adminCommission:
            0,

          contractorReward:
            0,

          paymentStatus:
            "Not Started",

          adminApprovalStatus:
            "Pending"

        });


      created++;

    }
    catch (error) {

      /*
       * Duplicate होने पर
       * scheduler बंद नहीं होगा.
       */

      if (
        error.code === 11000
      ) {

        skipped++;

        continue;

      }


      console.error(
        "❌ MONTHLY RECORD CREATE ERROR:",
        error
      );

    }

  }


  console.log(
    `✅ Created: ${created}`
  );

  console.log(
    `⏭️ Skipped: ${skipped}`
  );


  return {

    periodStart,

    periodEnd,

    verificationDate:
      finalVerificationDate,

    periodLabel,

    totalJoined:
      joinedReferrals.length,

    created,

    skipped

  };

}


/* =========================================================
   RECEIVER NOTIFICATION
========================================================= */

async function notifyReceivingContractors(
  verificationDate = new Date()
) {

  const {

    periodStart,

    periodEnd,

    periodLabel

  } =
    getRewardPeriod(
      verificationDate
    );


  const records =
    await MonthlyRewardVerification.find({

      periodStart,

      periodEnd,

      receiverStatus:
        "Pending"

    });


  const contractors =
    new Set();


  for (
    const record
    of records
  ) {

    const contractorId =
      String(
        record.referredTo
      );


    if (
      contractors.has(
        contractorId
      )
    ) {

      continue;

    }


    contractors.add(
      contractorId
    );


    try {

      await notificationRoutes
        .createNotification(

          record.referredTo,

          "📋 Monthly Worker Verification",

          `Please verify your referred workers for ${periodLabel}. Working / Not Working.`,

          "MonthlyReward",

          record._id,

          record.workerMobile

        );

    }
    catch (error) {

      console.error(
        "❌ RECEIVER NOTIFICATION ERROR:",
        error
      );

    }

  }


  console.log(
    `🔔 Receiver contractors notified: ${contractors.size}`
  );

}


/* =========================================================
   REFERRER NOTIFICATION

   सिर्फ तब भेजेंगे जब receiver ने
   Working / Not Working किया हो.
========================================================= */

async function notifyReferringContractors(
  verificationDate = new Date()
) {

  const {

    periodStart,

    periodEnd,

    periodLabel

  } =
    getRewardPeriod(
      verificationDate
    );


  const records =
    await MonthlyRewardVerification.find({

      periodStart,

      periodEnd,

      receiverStatus: {
        $in: [
          "Working",
          "Not Working"
        ]
      },

      referrerStatus:
        "Pending"

    });


  const contractors =
    new Set();


  for (
    const record
    of records
  ) {

    const contractorId =
      String(
        record.referredBy
      );


    if (
      contractors.has(
        contractorId
      )
    ) {

      continue;

    }


    contractors.add(
      contractorId
    );


    try {

      await notificationRoutes
        .createNotification(

          record.referredBy,

          "👷 Worker Verification Update",

          `Your referred worker verification is available for ${periodLabel}. Please review it.`,

          "MonthlyReward",

          record._id,

          record.workerMobile

        );

    }
    catch (error) {

      console.error(
        "❌ REFERRER NOTIFICATION ERROR:",
        error
      );

    }

  }


  console.log(
    `🔔 Referring contractors notified: ${contractors.size}`
  );

}


/* =========================================================
   SCHEDULER
========================================================= */

let lastGenerateKey =
  null;

let lastReceiverKey =
  null;

let lastReferrerKey =
  null;


/* =========================================================
   SCHEDULER TICK
========================================================= */

async function schedulerTick() {

  try {

    const parts =
      getIndiaParts();


    const day =
      Number(parts.day);

    const hour =
      Number(parts.hour);

    const minute =
      Number(parts.minute);


    /*
     * केवल 15 तारीख.
     */

    if (
      day !== 15
    ) {

      return;

    }


    /*
     * =========================================
     * 00:00 - GENERATE
     * =========================================
     */

    if (
      hour === 0 &&
      minute < 10
    ) {

      const key =
        `${parts.year}-${parts.month}-generate`;


      if (
        lastGenerateKey !== key
      ) {

        lastGenerateKey =
          key;


        await generateMonthlyRecords(
          new Date()
        );

      }

    }


    /*
     * =========================================
     * 09:00 - RECEIVER
     * =========================================
     */

    if (
      hour === 9 &&
      minute < 10
    ) {

      const key =
        `${parts.year}-${parts.month}-receiver`;


      if (
        lastReceiverKey !== key
      ) {

        lastReceiverKey =
          key;


        /*
         * Safety:
         * records missing हों तो पहले generate.
         */

        await generateMonthlyRecords(
          new Date()
        );


        await notifyReceivingContractors(
          new Date()
        );

      }

    }


    /*
     * =========================================
     * 18:00 - REFERRER
     * =========================================
     */

    if (
      hour === 18 &&
      minute < 10
    ) {

      const key =
        `${parts.year}-${parts.month}-referrer`;


      if (
        lastReferrerKey !== key
      ) {

        lastReferrerKey =
          key;


        await notifyReferringContractors(
          new Date()
        );

      }

    }

  }
  catch (error) {

    console.error(
      "❌ MONTHLY REWARD SCHEDULER ERROR:",
      error
    );

  }

}


/* =========================================================
   START
========================================================= */

function startMonthlyRewardScheduler() {

  console.log(
    "🟢 Monthly Reward Scheduler Started"
  );


  /*
   * हर minute check.
   */

  setInterval(
    schedulerTick,
    60 * 1000
  );


  /*
   * Server restart के बाद भी
   * current time check होगा.
   */

  schedulerTick();

}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  startMonthlyRewardScheduler,

  generateMonthlyRecords,

  notifyReceivingContractors,

  notifyReferringContractors,

  getRewardPeriod

};
