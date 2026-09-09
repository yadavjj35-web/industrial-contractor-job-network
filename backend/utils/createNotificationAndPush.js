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

  let notification = null;


  try {

    /* =========================================
       1. SAVE NOTIFICATION IN DATABASE
    ========================================= */

    notification =
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
      await Contractor
        .findById(
          contractorId
        )
        .select("fcmTokens");


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
       3. REMOVE EMPTY / DUPLICATE TOKENS
    ========================================= */

    const tokens =
      [

        ...new Set(

          contractor.fcmTokens.filter(
            token =>
              token &&
              typeof token === "string" &&
              token.trim() !== ""
          )

        )

      ];


    if (!tokens.length) {

      console.log(
        "⚠️ No valid FCM tokens found"
      );


      return notification;

    }


    /* =========================================
       4. CREATE PUSH DATA

       IMPORTANT:
       Firebase DATA में सभी values String होनी चाहिए.

       यह Android App के
       MyFirebaseMessagingService
       में मिलेगा.
    ========================================= */

    const pushData = {

      title:
        String(title || "ContractorHub"),


      body:
        String(message || ""),


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

          .filter(
            ([key]) => key
          )

          .map(
            ([key, value]) => [

              String(key),

              value === null ||
              value === undefined

                ? ""

                : String(value)

            ]
          )

      )

    };


    /* =========================================
       5. SEND FCM PUSH NOTIFICATION

       IMPORTANT:

       ANDROID:
       केवल DATA payload use करेगा.
       इससे MyFirebaseMessagingService का
       onMessageReceived() call होगा.

       WEBSITE:
       webpush.notification use करेगा.
    ========================================= */

    const response =
      await admin
        .messaging()
        .sendEachForMulticast({

          tokens,


          /* =====================================
             DATA PAYLOAD

             ANDROID APP
          ===================================== */

          data:
            pushData,


          /* =====================================
             ANDROID SETTINGS
          ===================================== */

          android: {

            priority:
              "high"

          },


          /* =====================================
             WEB PUSH SETTINGS

             WEBSITE BROWSER
          ===================================== */

          webpush: {

            notification: {

              title:
                String(title || "ContractorHub"),


              body:
                String(message || ""),


              icon:
                "/icon-192.png",


              badge:
                "/icon-192.png"

            },


            data:
              pushData,


            fcmOptions: {

              link:
                "/notifications.html"

            }

          }

        });


    console.log(

      `📱 FCM Push Result: ${response.successCount} success, ${response.failureCount} failed`

    );


    /* =========================================
       6. CHECK FAILED TOKENS
    ========================================= */

    const invalidTokens =
      [];


    response.responses.forEach(

      (result, index) => {

        if (!result.success) {

          const code =
            result.error?.code;


          console.error(

            "❌ FCM TOKEN FAILED:",

            tokens[index],

            code,

            result.error?.message

          );


          /* =====================================
             REMOVE ONLY INVALID TOKENS
          ===================================== */

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


    /* =========================================
       7. REMOVE INVALID TOKENS FROM DATABASE
    ========================================= */

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

        "🗑️ Invalid FCM tokens removed:",

        invalidTokens.length

      );

    }


    return notification;

  }


  catch (error) {

    console.error(

      "❌ CREATE NOTIFICATION / PUSH ERROR:",

      error.message

    );


    /*
     Notification पहले ही save हो चुकी हो तो
     उसे return करेंगे.

     इसलिए Push fail होने पर भी
     database notification खत्म नहीं होगी.
    */

    return notification;

  }

}


module.exports =
  createNotificationAndPush;
