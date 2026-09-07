const router = require("express").Router();

const Notification = require("../models/Notification");
const Contractor = require("../models/Contractor");

const auth = require("../middleware/authMiddleware");
const admin = require("../config/firebaseAdmin");


/* =========================================================
   SEND PUSH NOTIFICATION FUNCTION
========================================================= */

async function sendPushNotification(
  contractorId,
  title,
  message,
  type = "General",
  referralId = null
) {

  try {

    /* =========================================
       GET CONTRACTOR FCM TOKEN
    ========================================= */

    const contractor =
      await Contractor.findById(contractorId)
      .select("fcmTokens");


    if (
      !contractor ||
      !contractor.fcmTokens ||
      !contractor.fcmTokens.length
    ) {

      console.log(
        "No FCM token found for contractor:",
        contractorId
      );

      return;

    }


    /* =========================================
       REMOVE EMPTY TOKENS
    ========================================= */

    const tokens =
      contractor.fcmTokens.filter(Boolean);


    if (!tokens.length) {

      return;

    }


    /* =========================================
       SEND FCM MULTICAST
    ========================================= */

    const response =
      await admin.messaging().sendEachForMulticast({

        tokens,

        notification: {

          title: String(title),

          body: String(message)

        },


        data: {

          contractorId:
            String(contractorId),

          type:
            String(type || "General"),

          referralId:
            referralId
              ? String(referralId)
              : ""

        },


        android: {

          priority: "high",

          notification: {

            sound: "default",

            channelId:
              "contractor_notifications"

          }

        },


        webpush: {

          notification: {

            icon: "/icon-192.png",

            badge: "/icon-192.png"

          },

          fcmOptions: {

            link:
              "/notifications.html"

          }

        }

      });


    console.log(

      "FCM Push Sent:",

      response.successCount,

      "Success",

      response.failureCount,

      "Failed"

    );


    /* =========================================
       REMOVE INVALID TOKENS
    ========================================= */

    const invalidTokens = [];


    response.responses.forEach(
      (result, index) => {

        if (!result.success) {

          const errorCode =
            result.error?.code;


          if (

            errorCode ===
              "messaging/registration-token-not-registered"

            ||

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


    if (invalidTokens.length) {

      await Contractor.findByIdAndUpdate(

        contractorId,

        {

          $pull: {

            fcmTokens: {

              $in:
                invalidTokens

            }

          }

        }

      );


      console.log(
        "Invalid FCM tokens removed"
      );

    }


  }

  catch (error) {

    /*
      Push notification fail hone par
      main notification system fail nahi hoga
    */

    console.error(

      "FCM PUSH ERROR:",

      error.message

    );

  }

}


/* =========================================================
   CREATE NOTIFICATION + SEND PUSH

   दूसरे routes से इस function को use किया जा सकता है.
========================================================= */

async function createNotification(

  contractorId,

  title,

  message,

  type = "General",

  referralId = null

) {

  try {

    /* =========================================
       SAVE IN DATABASE
    ========================================= */

    const notification =
      await Notification.create({

        contractorId,

        title,

        message,

        type,

        referralId

      });


    /* =========================================
       SEND FCM PUSH
    ========================================= */

    await sendPushNotification(

      contractorId,

      title,

      message,

      type,

      referralId

    );


    return notification;

  }

  catch (error) {

    console.error(

      "CREATE NOTIFICATION ERROR:",

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

          createdAt:
            -1

        });


      res.json({

        success:
          true,

        notifications

      });

    }

    catch (error) {

      console.error(

        "GET NOTIFICATIONS ERROR:",

        error

      );


      res.status(500).json({

        success:
          false,

        message:
          "Unable to load notifications"

      });

    }

  }

);


/* =========================================================
   MARK SINGLE NOTIFICATION AS READ
========================================================= */

router.patch(

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

          success:
            false,

          message:
            "Notification not found"

        });

      }


      res.json({

        success:
          true,

        notification

      });

    }

    catch (error) {

      console.error(

        "READ NOTIFICATION ERROR:",

        error

      );


      res.status(500).json({

        success:
          false,

        message:
          "Unable to update notification"

      });

    }

  }

);


/* =========================================================
   MARK ALL NOTIFICATIONS AS READ
========================================================= */

router.patch(

  "/read-all",

  auth,

  async (req, res) => {

    try {

      await Notification.updateMany(

        {

          contractorId:
            req.contractorId,

          isRead:
            false

        },

        {

          isRead:
            true

        }

      );


      res.json({

        success:
          true,

        message:
          "All notifications marked as read"

      });

    }

    catch (error) {

      console.error(

        "READ ALL NOTIFICATIONS ERROR:",

        error

      );


      res.status(500).json({

        success:
          false,

        message:
          "Unable to update notifications"

      });

    }

  }

);


/* =========================================================
   EXPORT ROUTER + CREATE NOTIFICATION FUNCTION
========================================================= */

router.createNotification =
  createNotification;

router.sendPushNotification =
  sendPushNotification;


module.exports =
  router;
