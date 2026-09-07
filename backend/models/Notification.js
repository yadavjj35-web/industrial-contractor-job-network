const mongoose = require("mongoose");


const schema = new mongoose.Schema(

  {

    /* =====================================
       RECEIVER CONTRACTOR
    ===================================== */

    contractorId: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref:
        "Contractor",

      required:
        true

    },


    /* =====================================
       NOTIFICATION TITLE
    ===================================== */

    title: {

      type:
        String,

      required:
        true,

      trim:
        true

    },


    /* =====================================
       NOTIFICATION MESSAGE
    ===================================== */

    message: {

      type:
        String,

      required:
        true,

      trim:
        true

    },


    /* =====================================
       NOTIFICATION TYPE
    ===================================== */

    type: {

      type:
        String,

      default:
        "General"

    },


    /* =====================================
       REFERRAL ID

       Referral notification होने पर
       referral की ID save होगी.
    ===================================== */

    referralId: {

      type:
        mongoose.Schema.Types.ObjectId,

      ref:
        "Referral",

      default:
        null

    },


    /* =====================================
       READ STATUS
    ===================================== */

    isRead: {

      type:
        Boolean,

      default:
        false

    },


    /* =====================================
       PUSH NOTIFICATION STATUS

       Future Firebase Push tracking
    ===================================== */

    pushSent: {

      type:
        Boolean,

      default:
        false

    },


    /* =====================================
       PUSH SENT TIME
    ===================================== */

    pushSentAt: {

      type:
        Date,

      default:
        null

    }

  },


  /* =====================================
     CREATED AT + UPDATED AT
  ===================================== */

  {

    timestamps:
      true

  }

);


module.exports =
  mongoose.model(
    "Notification",
    schema
  );
