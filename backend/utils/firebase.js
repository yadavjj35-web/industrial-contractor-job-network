const admin = require("firebase-admin");

if (!admin.apps.length) {

  try {

    admin.initializeApp({

      credential:
        admin.credential.cert({

          projectId:
            process.env.FIREBASE_PROJECT_ID,

          clientEmail:
            process.env.FIREBASE_CLIENT_EMAIL,

          privateKey:
            process.env.FIREBASE_PRIVATE_KEY
              ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
              : undefined

        })

    });

    console.log("✅ Firebase Admin initialized");

  } catch (error) {

    console.error(
      "❌ Firebase Admin initialization error:",
      error.message
    );

  }

}

module.exports = admin;
