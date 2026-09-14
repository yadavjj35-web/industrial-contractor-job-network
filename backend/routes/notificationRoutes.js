const router = require("express").Router();

const Notification = require("../models/Notification");
const Contractor = require("../models/Contractor");
const auth = require("../middleware/authMiddleware");
const admin = require("../utils/firebase");

/* =========================================================
   SEND PUSH NOTIFICATION
   Android ke liye DATA-ONLY FCM
   ========================================================= */

async function sendPushNotification(
  contractorId,
  title,
  message,
  type = "General",
  referralId = null,
  workerMobile = null
) {
  try {
    console.log("======================================");
    console.log("FCM TARGET CONTRACTOR:", contractorId);
    console.log("WORKER MOBILE:", workerMobile);

    const contractor =
      await Contractor.findById(contractorId)
        .select("fcmTokens");

    if (
      !contractor ||
      !contractor.fcmTokens ||
      !contractor.fcmTokens.length
    ) {
      console.log(
        "❌ No FCM token found for contractor:",
        contractorId
      );

      return;
    }

    // Empty tokens remove
    const tokens =
      contractor.fcmTokens.filter(Boolean);

    if (!tokens.length) {
      console.log(
        "❌ No valid FCM tokens found"
      );

      return;
    }

    console.log(
      "FCM TOKENS COUNT:",
      tokens.length
    );

    /*
      IMPORTANT:
      notification:{} intentionally nahi hai.

      Data-only message Android ke
      MyFirebaseMessagingService.onMessageReceived()
      tak jayega.
    */

    const response =
      await admin.messaging().sendEachForMulticast({

        tokens,

        data: {

          contractorId:
            String(contractorId),

          title:
            String(
              title || "ContractorHub"
            ),

          body:
            String(
              message || ""
            ),

          type:
            String(
              type || "General"
            ),

          referralId:
            referralId
              ? String(referralId)
              : "",

          workerMobile:
            workerMobile
              ? String(workerMobile)
              : ""
        },

        android: {
          priority: "high"
        }
      });

    console.log(
      "FCM Push Sent:",
      response.successCount,
      "Success",
      response.failureCount,
      "Failed"
    );

    /* =====================================================
       INDIVIDUAL TOKEN RESULT
    ===================================================== */

    const invalidTokens = [];

    response.responses.forEach(
      (result, index) => {

        console.log(
          "FCM TOKEN RESULT:",
          index,

          result.success
            ? "SUCCESS"
            : `FAILED - ${
                result.error?.code ||
                "UNKNOWN"
              }`
        );

        if (!result.success) {

          console.log(
            "FCM ERROR:",
            result.error?.message ||
              "Unknown FCM error"
          );

          const errorCode =
            result.error?.code;

          if (
            errorCode ===
              "messaging/registration-token-not-registered" ||

            errorCode ===
              "messaging/invalid-registration-token"
          ) {

            invalidTokens.push(
              tokens[index]
            );
          }
        }
      }
    );

    /* =====================================================
       REMOVE INVALID TOKENS
    ===================================================== */

    if (invalidTokens.length) {

      await Contractor.findByIdAndUpdate(
        contractorId,
        {
          $pull: {
            fcmTokens: {
              $in: invalidTokens
            }
          }
        }
      );

      console.log(
        "🗑️ Invalid FCM tokens removed:",
        invalidTokens.length
      );
    }

    console.log(
      "======================================"
    );

  } catch (error) {

    console.error(
      "❌ FCM PUSH ERROR:",
      error.message
    );

    console.error(error);
  }
}


/* =========================================================
   CREATE NOTIFICATION
   ========================================================= */

async function createNotification(
  contractorId,
  title,
  message,
  type = "General",
  referralId = null,
  workerMobile = null
) {

  try {

    // MongoDB notification save
    const notification =
      await Notification.create({

        contractorId,

        title,

        message,

        type,

        referralId
      });

    console.log(
      "✅ Notification saved in MongoDB:",
      notification._id
    );

    // Android FCM push
    await sendPushNotification(

      contractorId,

      title,

      message,

      type,

      referralId,

      workerMobile

    );

    return notification;

  } catch (error) {

    console.error(
      "❌ CREATE NOTIFICATION ERROR:",
      error
    );

    throw error;
  }
}


/* =========================================================
   GET MY NOTIFICATIONS
   ========================================================= */

router.get(
  "/",
  auth,
  async (req, res) => {

    try {

      const notifications =
        await Notification.find({

          contractorId:
            req.contractorId

        })
        .sort({
          createdAt: -1
        })
        .limit(100);

      res.json(
        notifications
      );

    } catch (error) {

      console.error(
        "GET NOTIFICATIONS ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Failed to fetch notifications"

      });
    }
  }
);


/* =========================================================
   MARK NOTIFICATION AS READ
   ========================================================= */

router.put(
  "/:id/read",
  auth,
  async (req, res) => {

    try {

      const notification =
        await Notification.findOneAndUpdate(

          {
            _id:
              req.params.id,

            contractorId:
              req.contractorId
          },

          {
            isRead:
              true
          },

          {
            new:
              true
          }
        );

      if (!notification) {

        return res.status(404).json({

          message:
            "Notification not found"

        });
      }

      res.json(
        notification
      );

    } catch (error) {

      console.error(
        "MARK NOTIFICATION READ ERROR:",
        error
      );

      res.status(500).json({

        message:
          "Failed to mark notification as read"

      });
    }
  }
);


/* =========================================================
   EXPORT FUNCTIONS
   Referral route inko use karta hai
   ========================================================= */

router.createNotification =
  createNotification;

router.sendPushNotification =
  sendPushNotification;

module.exports =
  router;
