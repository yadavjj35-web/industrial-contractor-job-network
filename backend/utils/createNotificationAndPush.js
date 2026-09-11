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

    /* =====================================================
       1. SAVE NOTIFICATION IN DATABASE
    ===================================================== */

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


    /* =====================================================
       2. GET CONTRACTOR FCM TOKENS
    ===================================================== */

    const contractor =
      await Contractor
        .findById(contractorId)
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


    /* =====================================================
       3. CLEAN TOKENS
    ===================================================== */

    const tokens =
      [
        ...new Set(

          contractor.fcmTokens
            .filter(
              token =>
                token &&
                typeof token === "string" &&
                token.trim() !== ""
            )
            .map(
              token =>
                token.trim()
            )

        )

      ];


    if (!tokens.length) {

      console.log(
        "⚠️ No valid FCM tokens found"
      );

      return notification;

    }


    console.log(
      "📱 FCM tokens found:",
      tokens.length
    );


    /* =====================================================
       4. CREATE DATA PAYLOAD

       IMPORTANT:
       Firebase DATA payload की सभी values
       STRING होनी चाहिए.

       Android:
       MyFirebaseMessagingService
       के onMessageReceived() में यही data आएगा.
    ===================================================== */

    const pushData = {

      title:
        String(
          title ||
          "ContractorHub"
        ),


      body:
        String(
          message ||
          ""
        ),


      notificationId:
        String(
          notification._id
        ),


      contractorId:
        String(
          contractorId
        ),


      type:
        String(
          type ||
          "General"
        ),


      referralId:
        referralId
          ? String(referralId)
          : "",


      /* =================================================
         EXTRA DATA
      ================================================= */

      ...Object.fromEntries(

        Object.entries(
          data || {}
        )

          .filter(
            ([key]) =>
              key &&
              key !== "title" &&
              key !== "body" &&
              key !== "type" &&
              key !== "notificationId" &&
              key !== "contractorId" &&
              key !== "referralId"
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


    console.log(
      "📦 FCM DATA:",
      pushData
    );


    /* =====================================================
       5. SEND FCM

       ANDROID:
       DATA-ONLY MESSAGE

       इसलिए Android का:

       onMessageReceived()

       call होगा.

       WEB:
       webpush notification इस्तेमाल होगा.
    ===================================================== */

    const response =
      await admin
        .messaging()
        .sendEachForMulticast({

          tokens,


          /* =================================================
             ANDROID DATA PAYLOAD
          ================================================= */

          data:
            pushData,


          /* =================================================
             ANDROID HIGH PRIORITY
          ================================================= */

          android: {

            priority:
              "high"

          },


          /* =================================================
             WEB PUSH
          ================================================= */

          webpush: {

            notification: {

              title:
                String(
                  title ||
                  "ContractorHub"
                ),


              body:
                String(
                  message ||
                  ""
                ),


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


    /* =====================================================
       6. CHECK FAILED TOKENS
    ===================================================== */

    const invalidTokens = [];


    response.responses.forEach(

      (result, index) => {

        if (result.success) {

          console.log(
            "✅ FCM sent successfully:",
            tokens[index]
          );

          return;

        }


        const code =
          result.error?.code;


        const errorMessage =
          result.error?.message;


        console.error(

          "❌ FCM TOKEN FAILED:",

          tokens[index],

          code,

          errorMessage

        );


        /* =================================================
           ONLY REMOVE INVALID / EXPIRED TOKENS
        ================================================= */

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

    );


    /* =====================================================
       7. REMOVE INVALID TOKENS
    ===================================================== */

    if (
      invalidTokens.length > 0
    ) {

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


    /* =====================================================
       8. FINISH
    ===================================================== */

    return notification;

  }


  catch (error) {

    console.error(

      "❌ CREATE NOTIFICATION / PUSH ERROR:",

      error.message

    );


    /*
     Database notification पहले save हो चुकी
     हो तो उसे वापस return करें.
    */

    return notification;

  }

}


module.exports =
  createNotificationAndPush;
