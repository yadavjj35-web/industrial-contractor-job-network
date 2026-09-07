const admin = require("firebase-admin");


/* =========================================
   CHECK IF FIREBASE IS ALREADY INITIALIZED
========================================= */

if (!admin.apps.length) {

  try {

    /* =========================================
       FIREBASE SERVICE ACCOUNT
    ========================================= */

    const serviceAccount = {

      type:
        process.env.FIREBASE_TYPE,

      project_id:
        process.env.FIREBASE_PROJECT_ID,

      private_key_id:
        process.env.FIREBASE_PRIVATE_KEY_ID,

      private_key:

        process.env.FIREBASE_PRIVATE_KEY
          ? process.env.FIREBASE_PRIVATE_KEY
              .replace(/\\n/g, "\n")
          : undefined,

      client_email:
        process.env.FIREBASE_CLIENT_EMAIL,

      client_id:
        process.env.FIREBASE_CLIENT_ID,

      auth_uri:
        process.env.FIREBASE_AUTH_URI,

      token_uri:
        process.env.FIREBASE_TOKEN_URI,

      auth_provider_x509_cert_url:
        process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,

      client_x509_cert_url:
        process.env.FIREBASE_CLIENT_CERT_URL

    };


    /* =========================================
       INITIALIZE FIREBASE
    ========================================= */

    admin.initializeApp({

      credential:
        admin.credential.cert(
          serviceAccount
        )

    });


    console.log(
      "✅ Firebase Admin initialized"
    );

  }

  catch (error) {

    console.error(
      "❌ Firebase Admin initialization error:",
      error.message
    );

  }

}


/* =========================================
   EXPORT
========================================= */

module.exports =
  admin;
