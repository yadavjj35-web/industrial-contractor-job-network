const Notification =
  require("../models/Notification");

const Contractor =
  require("../models/Contractor");

const admin =
  require("./firebase");


/* =========================================================
   CREATE NOTIFICATION + SEND PUSH
========================================================= */

async function createNotificationAndPush({

  contractorId,

  title,

  message,

  type = "General",

  referralId = null,

  data = {}

}) {

  try {

    /* =========================================
       1. SAVE NOTIFICATION IN DATABASE
    ========================================= */

    const notification =
      await Notification.create({

        contractorId,

        title,

        message,

        type,

        referralId

      });


    console.log(
      "✅ Notification saved:",
      notification._id
    );


    /* =========================================
       2. GET CONTRACTOR FCM TOKENS
    ========================================= */

    const contractor =
      await Contractor.findById(
        contractorId
      ).select("fcmTokens");


    if (

      !contractor ||

      !Array.isArray(
        contractor.fcmTokens
      ) ||

      contractor.fcmTokens.length === 0

    ) {

      console.log(
        "⚠️ No FCM token found for contractor:",
        contractorId
      );


      return notification;

    }


    /* =========================================
       REMOVE EMPTY TOKENS
    ========================================= */

    const tokens =
      contractor.fcmTokens.filter(
        token => token
      );


    if (!tokens.length) {

      return notification;

    }


    /* =========================================
       3. CREATE PUSH DATA

       Firebase data values must be strings
    ========================================= */

    const pushData = {

      notificationId:
        String(notification._id),

      contractorId:
        String(contractorId),

      type:
        String(type || "General"),

      referralId:

        referralId
          ? String(referralId)
          : "",

      ...Object.fromEntries(

        Object.entries(data || {})
          .map(
            ([key, value]) => [

              key,

              String(value)

            ]
          )

      )

    };


    /* =========================================
       4. SEND PUSH NOTIFICATION
    ========================================= */

    const response =
      await admin
        .messaging()
        .sendEachForMulticast({

          tokens,


          notification: {

            title:
              String(title),

            body:
              String(message)

          },


          data:
            pushData,


          /* ===================================
             ANDROID SETTINGS
          =================================== */

          android: {

            priority:
              "high",

            notification: {

              sound:
                "default",

              channelId:
                "contractor_notifications"

            }

          },


          /* ===================================
             WEB PUSH SETTINGS
          =================================== */

          webpush: {

            notification: {

              icon:
                "/icon-192.png",

              badge:
                "/icon-192.png"

            },


            fcmOptions: {

              link:
                "/notifications.html"

            }

          }

        });


    console.log(

      `📱 Push Result: ${response.successCount} success, ${response.failureCount} failed`

    );


    /* =========================================
       5. REMOVE INVALID TOKENS
    ========================================= */

    const invalidTokens =
      [];


    response.responses.forEach(

      (result, index) => {

        if (!result.success) {

          const code =
            result.error?.code;


          if (

            code ===
              "messaging/registration-token-not-registered"

            ||

            code ===
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
        "🗑️ Invalid FCM tokens removed"
      );

    }


    return notification;

  }

  catch (error) {

    /*
      IMPORTANT:

      अगर Push fail हो जाए,
      तब भी notification database में
      save हो चुकी हो सकती है.

      इसलिए error केवल log कर रहे हैं.
    */

    console.error(

      "❌ CREATE NOTIFICATION / PUSH ERROR:",

      error.message

    );


    return null;

  }

}


module.exports =
  createNotificationAndPush;
