const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");


const schema = new mongoose.Schema(

  {

    /* =====================================
       BASIC DETAILS
    ===================================== */

    contractorName: {

      type: String,

      required: true,

      trim: true

    },


    ownerName: {

      type: String,

      required: true,

      trim: true

    },


    mobile: {

      type: String,

      required: true,

      unique: true

    },


    email: {

      type: String,

      trim: true,

      lowercase: true,

      sparse: true,

      unique: true

    },


    /* =====================================
       PASSWORD
    ===================================== */

    password: {

      type: String,

      required: true,

      select: false

    },


    /* =====================================
       LOCATION
    ===================================== */

    industrialArea: {

      type: String,

      default: ""

    },


    city: {

      type: String,

      default: ""

    },


    address: {

      type: String,

      default: ""

    },


    /* =====================================
       BUSINESS DOCUMENTS
    ===================================== */

    gst: {

      type: String,

      default: ""

    },


    pan: {

      type: String,

      default: ""

    },


    licenseNumber: {

      type: String,

      default: ""

    },


    /* =====================================
       ACCOUNT STATUS
    ===================================== */

    verificationStatus: {

      type: String,

      enum: [

        "Pending",
        "Approved",
        "Rejected"

      ],

      default: "Pending"

    },


    isActive: {

      type: Boolean,

      default: true

    },


    /* =====================================
       FIREBASE CLOUD MESSAGING TOKENS

       Website और Future Android App
       दोनों के tokens यहां save होंगे.
    ===================================== */

    fcmTokens: {

      type: [

        {

          type: String

        }

      ],

      default: []

    }

  },


  {

    timestamps: true

  }

);


/* =========================================
   PASSWORD HASH
========================================= */

schema.pre(

  "save",

  async function(next) {

    try {

      if (!this.isModified("password")) {

        return next();

      }


      this.password =
        await bcrypt.hash(
          this.password,
          10
        );


      next();

    }

    catch (error) {

      next(error);

    }

  }

);


/* =========================================
   COMPARE PASSWORD
========================================= */

schema.methods.comparePassword =
  function(password) {

    return bcrypt.compare(
      password,
      this.password
    );

  };


module.exports =
  mongoose.model(
    "Contractor",
    schema
  );
