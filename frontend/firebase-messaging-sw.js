/* =====================================
   FIREBASE MESSAGING SERVICE WORKER
===================================== */

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);


/* =====================================
   FIREBASE CONFIG
===================================== */

firebase.initializeApp({

  apiKey:
    "AIzaSyA7kt0v0XJLxNroMaptP1QLsVtyaIPErh8",

  authDomain:
    "contractors-notification.firebaseapp.com",

  projectId:
    "contractors-notification",

  storageBucket:
    "contractors-notification.firebasestorage.app",

  messagingSenderId:
    "135938296395",

  appId:
    "1:135938296395:web:068923b07b16813d029bce",

  measurementId:
    "G-M8Q70WMG4G"

});


/* =====================================
   FIREBASE MESSAGING
===================================== */

const messaging =
  firebase.messaging();


/* =====================================
   BACKGROUND NOTIFICATION
===================================== */

messaging.onBackgroundMessage(
  function(payload) {

    console.log(
      "🔔 Background notification:",
      payload
    );


    const title =
      payload.notification?.title ||
      "Contractor Notification";


    const options = {

      body:
        payload.notification?.body ||
        "You have a new notification.",

      icon: "/icon.png"

    };


    self.registration.showNotification(
      title,
      options
    );

  }
);
