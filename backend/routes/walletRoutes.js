const router = require("express").Router();

const crypto = require("crypto");
const Razorpay = require("razorpay");

const auth =
  require("../middleware/authMiddleware");

const Wallet =
  require("../models/Wallet");

const WalletTransaction =
  require("../models/WalletTransaction");

const WithdrawalRequest =
  require("../models/WithdrawalRequest");

const MonthlyRewardVerification =
  require("../models/MonthlyRewardVerification");

const Contractor =
  require("../models/Contractor");


/* =====================================================
   CONFIG
===================================================== */

const MIN_WITHDRAWAL =
  Number(
    process.env.MIN_WITHDRAWAL || 100
  );

const REWARD_PER_WORKER =
  Number(
    process.env.WALLET_REWARD_PER_WORKER || 50
  );

const COMMISSION_PERCENT =
  Number(
    process.env.WALLET_ADMIN_COMMISSION_PERCENT || 10
  );

const RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID;

const RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET;

const razorpay =
  RAZORPAY_KEY_ID &&
  RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET
      })
    : null;


/* =====================================================
   ADMIN AUTH
===================================================== */

async function adminAuth(req, res, next) {

  try {

    const jwt =
      require("jsonwebtoken");

    const token =
      (
        req.headers.authorization || ""
      ).replace(
        /^Bearer\s+/i,
        ""
      );

    if (!token) {

      return res.status(401).json({
        success: false,
        message:
          "Admin authentication required"
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const adminId =
      decoded.adminId ||
      decoded.id ||
      decoded._id ||
      decoded.userId;

    if (!adminId) {

      return res.status(401).json({
        success: false,
        message:
          "Invalid admin token"
      });
    }

    req.adminId =
      adminId;

    req.admin = {
      _id: adminId,
      id: adminId,
      adminId
    };

    next();

  } catch (error) {

    console.error(
      "ADMIN AUTH ERROR:",
      error
    );

    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired admin token"
    });
  }
}


/* =====================================================
   WALLET HELPER
===================================================== */

async function getOrCreateWallet(
  contractorId,
  session = null
) {

  let wallet =
    await Wallet.findOne({
      contractorId
    }).session(session);

  if (!wallet) {

    wallet =
      await Wallet.create(
        [
          {
            contractorId,
            availableBalance: 0,
            pendingBalance: 0,
            totalEarned: 0,
            totalWithdrawn: 0
          }
        ],
        session
      );

    wallet =
      wallet[0];
  }

  return wallet;
}


/* =====================================================
   CREDIT REWARD TO REFERRER WALLET
===================================================== */

  /* =====================================================
   CREDIT REWARD TO REFERRER WALLET

   RULES:
   1. referredBy exists
      → credit contractor wallet

   2. referredBy is null
      → Admin reward
      → no contractor wallet credit required

   3. Already credited
      → do not credit again

   4. Public/direct referral
      → payment verification must NOT fail
===================================================== */

async function creditRewardToWallet(
  reward,
  session
) {

  /* ===================================================
     ALREADY CREDITED
  =================================================== */

  if (
    reward.walletCreditStatus ===
    "Credited"
  ) {

    return {
      success: true,

      alreadyCredited: true,

      recipient:
        reward.referredBy
          ? "Contractor"
          : "Admin",

      amount:
        Number(
          reward.contractorReward || 0
        )
    };
  }


  /* ===================================================
     PAYMENT CHECK
  =================================================== */

  if (
    reward.paymentStatus !==
    "Paid"
  ) {

    throw new Error(
      "Payment has not been completed"
    );
  }


  /* ===================================================
     FINAL CHECK
  =================================================== */

  if (
    reward.rewardStatus !==
    "Final"
  ) {

    throw new Error(
      "Reward is not finalized"
    );
  }


  /* ===================================================
     ADMIN APPROVAL
  =================================================== */

  if (
    reward.adminApprovalStatus !==
    "Approved"
  ) {

    throw new Error(
      "Reward is not approved"
    );
  }


  /* ===================================================
     REWARD AMOUNT
  =================================================== */

  const amount =
    Number(
      reward.contractorReward || 0
    );


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    throw new Error(
      "Invalid contractor reward amount"
    );
  }


  /* ===================================================
     DETERMINE RECIPIENT
     
     referredBy = contractor who referred worker
     
     null = public/direct referral
     → Admin is reward recipient
  =================================================== */

  const contractorId =
    reward.referredBy || null;


  /* ===================================================
     ADMIN REWARD
     
     IMPORTANT:
     referredBy null is NOT an error.
  =================================================== */

  if (!contractorId) {

    console.log(
      "ADMIN REWARD — NO CONTRACTOR WALLET CREDIT:",
      {
        rewardId:
          String(
            reward._id
          ),

        workerName:
          String(
            reward.workerName || ""
          ),

        workerMobile:
          String(
            reward.workerMobile || ""
          ),

        grossReward:
          Number(
            reward.rewardAmount || 0
          ),

        adminCommission:
          Number(
            reward.adminCommission || 0
          ),

        contractorReward:
          amount
      }
    );


    /*
     * No contractor wallet exists for this reward.
     *
     * Mark it as Credited from the reward-processing
     * point of view so batch verification does not
     * fail on public/direct referrals.
     */

    reward.walletCreditStatus =
      "Credited";

    reward.walletTransactionId =
      null;

    reward.walletCreditedAt =
      new Date();

    reward.walletCreditFailureReason =
      "";

    /*
     * Explicitly store Admin as recipient when the
     * schema supports this field.
     *
     * Mongoose will ignore it if the schema does not
     * contain the field.
     */

    if (
      Object.prototype.hasOwnProperty.call(
        reward.toObject(),
        "rewardRecipient"
      )
    ) {

      reward.rewardRecipient =
        "Admin";
    }


    await reward.save({
      session
    });


    return {

      success: true,

      recipient:
        "Admin",

      adminReward:
        true,

      amount
    };
  }


  /* ===================================================
     CONTRACTOR REWARD
  =================================================== */

  const referenceId =
    `REWARD_${reward._id}`;


  /* ===================================================
     DUPLICATE TRANSACTION CHECK
  =================================================== */

  const existingTransaction =
    await WalletTransaction
      .findOne({

        contractorId,

        referenceId,

        type:
          "Reward"

      })
      .session(session);


  if (existingTransaction) {

    reward.walletCreditStatus =
      "Credited";

    reward.walletTransactionId =
      existingTransaction._id;

    reward.walletCreditedAt =
      existingTransaction.createdAt ||
      new Date();

    reward.walletCreditFailureReason =
      "";

    await reward.save({
      session
    });


    return {

      success: true,

      alreadyCredited: true,

      recipient:
        "Contractor",

      transaction:
        existingTransaction,

      amount
    };
  }


  /* ===================================================
     VERIFY CONTRACTOR EXISTS
  =================================================== */

  const contractor =
    await Contractor
      .findById(
        contractorId
      )
      .session(session);


  if (!contractor) {

    throw new Error(
      `Reward referrer contractor not found: ${contractorId}`
    );
  }


  /* ===================================================
     GET / CREATE WALLET
  =================================================== */

  const wallet =
    await getOrCreateWallet(
      contractorId,
      session
    );


  /* ===================================================
     BALANCE CALCULATION
  =================================================== */

  const balanceBefore =
    Number(
      wallet.availableBalance || 0
    );


  const balanceAfter =
    Number(
      (
        balanceBefore +
        amount
      ).toFixed(2)
    );


  /* ===================================================
     UPDATE WALLET
  =================================================== */

  wallet.availableBalance =
    balanceAfter;

  wallet.totalEarned =
    Number(
      (
        Number(
          wallet.totalEarned || 0
        ) +
        amount
      ).toFixed(2)
    );


  await wallet.save({
    session
  });


  /* ===================================================
     CREATE WALLET TRANSACTION
  =================================================== */

  const transaction =
    await WalletTransaction.create(
      [
        {

          contractorId,

          type:
            "Reward",

          direction:
            "Credit",

          amount,

          balanceBefore,

          balanceAfter,

          description:
            "Monthly worker referral reward",

          referenceId,

          referenceType:
            "MonthlyRewardVerification",

          status:
            "Completed",

          metadata: {

            rewardId:
              String(
                reward._id
              ),

            workerName:
              String(
                reward.workerName || ""
              ),

            workerMobile:
              String(
                reward.workerMobile || ""
              ),

            grossReward:
              Number(
                reward.rewardAmount || 0
              ),

            adminCommission:
              Number(
                reward.adminCommission || 0
              ),

            contractorReward:
              Number(
                reward.contractorReward || 0
              ),

            paymentId:
              String(
                reward.paymentId || ""
              )
          }
        }
      ],
      {
        session
      }
    );


  /* ===================================================
     MARK REWARD WALLET CREDITED
  =================================================== */

  reward.walletCreditStatus =
    "Credited";

  reward.walletTransactionId =
    transaction[0]._id;

  reward.walletCreditedAt =
    new Date();

  reward.walletCreditFailureReason =
    "";


  await reward.save({
    session
  });


  /* ===================================================
     SUCCESS
  =================================================== */

  return {

    success: true,

    recipient:
      "Contractor",

    amount,

    transaction:
      transaction[0]
  };
}

            


/* =====================================================
   GET MY WALLET
===================================================== */

router.get(
  "/",
  auth,
  async (req, res) => {

    try {

      const wallet =
        await getOrCreateWallet(
          req.contractor._id ||
          req.contractor.id
        );

      return res.json({
        success: true,
        wallet
      });

    } catch (error) {

      console.error(
        "GET WALLET ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load wallet"
      });
    }
  }
);


/* =====================================================
   WALLET TRANSACTIONS
===================================================== */

router.get(
  "/transactions",
  auth,
  async (req, res) => {

    try {

      const contractorId =
        req.contractor._id ||
        req.contractor.id;


      const transactions =
        await WalletTransaction
          .find({
            contractorId
          })
          .sort({
            createdAt: -1
          })
          .limit(200);


      return res.json({
        success: true,
        transactions
      });

    } catch (error) {

      console.error(
        "GET TRANSACTIONS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to load transactions"
      });
    }
  }
);


/* =====================================================
   CREATE SINGLE RAZORPAY REWARD PAYMENT ORDER

   OLD / COMPATIBILITY ROUTE

   Frontend can still use this route.
===================================================== */

router.post(
  "/reward-payment/order",
  auth,
  async (req, res) => {

    try {

      if (!razorpay) {

        return res.status(500).json({
          success: false,
          message:
            "Razorpay is not configured on server"
        });
      }


      if (
        !RAZORPAY_KEY_ID ||
        !RAZORPAY_KEY_SECRET
      ) {

        return res.status(500).json({
          success: false,
          message:
            "Razorpay Key ID or Secret is missing"
        });
      }


      const {
        rewardId
      } = req.body;


      if (!rewardId) {

        return res.status(400).json({
          success: false,
          message:
            "rewardId is required"
        });
      }


      const reward =
        await MonthlyRewardVerification
          .findById(rewardId);


      if (!reward) {

        return res.status(404).json({
          success: false,
          message:
            "Reward record not found"
        });
      }


      const contractorId =
        req.contractor?._id ||
        req.contractor?.id;


      if (!contractorId) {

        return res.status(401).json({
          success: false,
          message:
            "Contractor authentication required"
        });
      }


      if (
        String(
          reward.referredTo
        ) !==
        String(contractorId)
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Only receiving contractor can pay this reward"
        });
      }


      if (
        reward.rewardStatus !==
        "Final"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Reward is not finalized"
        });
      }


      if (
        reward.adminApprovalStatus !==
        "Approved"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Reward is not approved"
        });
      }


      if (
        reward.paymentStatus ===
        "Paid"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Reward has already been paid"
        });
      }


      const grossAmount =
        Number(
          reward.rewardAmount ||
          reward.rewardPerWorker ||
          REWARD_PER_WORKER
        );


      if (
        !Number.isFinite(
          grossAmount
        ) ||
        grossAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid reward amount"
        });
      }


      const amountInPaise =
        Math.round(
          grossAmount * 100
        );


      if (
        !Number.isInteger(
          amountInPaise
        ) ||
        amountInPaise <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid Razorpay amount"
        });
      }


      const order =
        await razorpay.orders.create({

          amount:
            amountInPaise,

          currency:
            "INR",

          receipt:
            `MR_${String(
              reward._id
            ).slice(-20)}_${Date.now()
              .toString()
              .slice(-8)}`,

          notes: {

            rewardId:
              String(
                reward._id
              ),

            workerName:
              String(
                reward.workerName || ""
              ).slice(0, 100),

            workerMobile:
              String(
                reward.workerMobile || ""
              ).slice(0, 20)
          }
        });


      if (
        !order ||
        !order.id
      ) {

        throw new Error(
          "Razorpay did not return a valid order"
        );
      }


      if (
        Number(order.amount) !==
        amountInPaise
      ) {

        throw new Error(
          `Razorpay amount mismatch. Expected ${amountInPaise}, received ${order.amount}`
        );
      }


      reward.paymentStatus =
        "Pending";

      reward.paymentOrderId =
        order.id;

      reward.paymentAmount =
        grossAmount;

      reward.paymentCurrency =
        "INR";

      reward.paymentFailureReason =
        "";


      await reward.save();


      return res.json({

        success:
          true,

        key:
          RAZORPAY_KEY_ID,

        order: {

          id:
            order.id,

          amount:
            Number(
              order.amount
            ),

          currency:
            order.currency
        }

      });

    } catch (error) {

      console.error(
        "CREATE PAYMENT ORDER ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          error?.error?.description ||
          error?.message ||
          "Unable to create payment order"
      });
    }
  }
);


/* =====================================================
   CREATE CONSOLIDATED / BATCH PAYMENT ORDER

   NEW ROUTE

   One Razorpay payment for ALL currently payable
   finalized rewards of the logged-in receiving contractor.
===================================================== */

router.post(
  "/reward-payment/batch-order",
  auth,
  async (req, res) => {

    try {

      if (!razorpay) {

        return res.status(500).json({
          success: false,
          message:
            "Razorpay is not configured on server"
        });
      }


      if (
        !RAZORPAY_KEY_ID ||
        !RAZORPAY_KEY_SECRET
      ) {

        return res.status(500).json({
          success: false,
          message:
            "Razorpay Key ID or Secret is missing"
        });
      }


      const contractorId =
        req.contractor?._id ||
        req.contractor?.id;


      if (!contractorId) {

        return res.status(401).json({
          success: false,
          message:
            "Contractor authentication required"
        });
      }


      /*
       * IMPORTANT
       *
       * Server itself finds all payable rewards.
       *
       * Frontend amount is NOT trusted.
       */

      const rewards =
        await MonthlyRewardVerification
          .find({
            referredTo:
              contractorId,

            rewardStatus:
              "Final",

            adminApprovalStatus:
              "Approved",

            paymentStatus: {
              $ne: "Paid"
            }
          })
          .sort({
            createdAt: 1
          });


      if (
        !rewards ||
        rewards.length === 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "No pending reward payment found"
        });
      }


      const validRewards =
        rewards.filter(
          reward => {

            const amount =
              Number(
                reward.rewardAmount ||
                reward.rewardPerWorker ||
                REWARD_PER_WORKER
              );

            return (
              Number.isFinite(amount) &&
              amount > 0
            );
          }
        );


      if (
        validRewards.length === 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "No valid reward amount found"
        });
      }


      const totalGrossAmount =
        Number(
          validRewards
            .reduce(
              (
                total,
                reward
              ) => {

                const amount =
                  Number(
                    reward.rewardAmount ||
                    reward.rewardPerWorker ||
                    REWARD_PER_WORKER
                  );

                return (
                  total +
                  amount
                );
              },
              0
            )
            .toFixed(2)
        );


      if (
        !Number.isFinite(
          totalGrossAmount
        ) ||
        totalGrossAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid total reward amount"
        });
      }


      const amountInPaise =
        Math.round(
          totalGrossAmount * 100
        );


      if (
        !Number.isInteger(
          amountInPaise
        ) ||
        amountInPaise <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid Razorpay amount"
        });
      }


      const batchReceipt =
        `MRB_${Date.now()
          .toString()
          .slice(-12)}_${crypto
          .randomBytes(4)
          .toString("hex")}`;


      const order =
        await razorpay.orders.create({

          amount:
            amountInPaise,

          currency:
            "INR",

          receipt:
            batchReceipt,

          notes: {

            type:
              "MonthlyRewardBatch",

            contractorId:
              String(
                contractorId
              ),

            rewardCount:
              String(
                validRewards.length
              ),

            totalGrossAmount:
              String(
                totalGrossAmount
              )
          }
        });


      if (
        !order ||
        !order.id
      ) {

        throw new Error(
          "Razorpay did not return a valid batch order"
        );
      }


      if (
        Number(order.amount) !==
        amountInPaise
      ) {

        throw new Error(
          `Razorpay amount mismatch. Expected ${amountInPaise}, received ${order.amount}`
        );
      }


      /*
       * IMPORTANT
       *
       * Same Razorpay order ID is stored on every
       * reward included in this batch.
       *
       * No schema change required if paymentOrderId
       * already exists in the model.
       */

      for (
        const reward
        of validRewards
      ) {

        reward.paymentStatus =
          "Pending";

        reward.paymentOrderId =
          order.id;

        reward.paymentAmount =
          Number(
            reward.rewardAmount ||
            reward.rewardPerWorker ||
            REWARD_PER_WORKER
          );

        reward.paymentCurrency =
          "INR";

        reward.paymentFailureReason =
          "";

        await reward.save();
      }


      console.log(
        "BATCH REWARD ORDER CREATED:",
        {
          orderId:
            order.id,

          contractorId:
            String(
              contractorId
            ),

          rewardCount:
            validRewards.length,

          rewardIds:
            validRewards.map(
              reward =>
                String(
                  reward._id
                )
            ),

          totalGrossAmount,

          amountInPaise
        }
      );


      return res.json({

        success:
          true,

        key:
          RAZORPAY_KEY_ID,

        batchId:
          order.id,

        rewardIds:
          validRewards.map(
            reward =>
              String(
                reward._id
              )
          ),

        workerCount:
          validRewards.length,

        totalAmount:
          totalGrossAmount,

        order: {

          id:
            order.id,

          amount:
            Number(
              order.amount
            ),

          currency:
            order.currency
        }

      });

    } catch (error) {

      console.error(
        "CREATE BATCH PAYMENT ORDER ERROR:",
        error
      );

      console.error(
        "BATCH RAZORPAY ERROR DETAILS:",
        {
          statusCode:
            error?.statusCode,

          description:
            error?.error?.description,

          reason:
            error?.error?.reason,

          code:
            error?.error?.code
        }
      );

      return res.status(500).json({

        success: false,

        message:
          error?.error?.description ||
          error?.message ||
          "Unable to create total reward payment order"
      });
    }
  }
);


/* =====================================================
   VERIFY CONSOLIDATED / BATCH PAYMENT

   NEW ROUTE

   Payment successful
   →
   Every reward marked Paid
   →
   Every referrer wallet credited
   →
   Payment records KEPT

   IMPORTANT:
   MonthlyRewardVerification is NOT deleted.
===================================================== */

router.post(
  "/reward-payment/batch-verify",
  auth,
  async (req, res) => {

    try {

      const {
        batchId,
        rewardIds,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = req.body;


      if (
        !batchId ||
        !Array.isArray(rewardIds) ||
        rewardIds.length === 0 ||
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Incomplete batch payment verification data"
        });
      }


      if (
        String(batchId) !==
        String(razorpay_order_id)
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Batch payment order mismatch"
        });
      }


      const contractorId =
        req.contractor?._id ||
        req.contractor?.id;


      if (!contractorId) {

        return res.status(401).json({
          success: false,
          message:
            "Contractor authentication required"
        });
      }


      if (!RAZORPAY_KEY_SECRET) {

        return res.status(500).json({
          success: false,
          message:
            "Razorpay secret is not configured"
        });
      }


      /* =================================================
         VERIFY RAZORPAY SIGNATURE
      ================================================= */

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            RAZORPAY_KEY_SECRET
          )
          .update(
            `${razorpay_order_id}|${razorpay_payment_id}`
          )
          .digest("hex");


      const expectedBuffer =
        Buffer.from(
          generatedSignature,
          "utf8"
        );

      const receivedBuffer =
        Buffer.from(
          razorpay_signature,
          "utf8"
        );


      if (
        expectedBuffer.length !==
        receivedBuffer.length
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment signature"
        });
      }


      const signatureValid =
        crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer
        );


      if (!signatureValid) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment signature"
        });
      }


      /* =================================================
         FETCH RAZORPAY ORDER
         
         This verifies the actual Razorpay order amount.
      ================================================= */

      let razorpayOrder = null;


      if (razorpay) {

        razorpayOrder =
          await razorpay.orders.fetch(
            razorpay_order_id
          );
      }


      if (
        !razorpayOrder ||
        Number(
          razorpayOrder.amount
        ) <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Unable to verify Razorpay order amount"
        });
      }


      /* =================================================
         DATABASE TRANSACTION
      ================================================= */

      const session =
        await MonthlyRewardVerification
          .db
          .startSession();


      let result = null;


      try {

        await session.withTransaction(
          async () => {

            /*
             * Load all records from the batch.
             */

            const rewards =
              await MonthlyRewardVerification
                .find({
                  _id: {
                    $in:
                      rewardIds
                  },

                  referredTo:
                    contractorId,

                  paymentOrderId:
                    razorpay_order_id
                })
                .session(session);


            if (
              rewards.length !==
              rewardIds.length
            ) {

              throw new Error(
                "Some reward records are missing or do not belong to this payment batch"
              );
            }


            /*
             * Calculate expected gross total
             */

            const totalGrossAmount =
              Number(
                rewards
                  .reduce(
                    (
                      total,
                      reward
                    ) => {

                      const amount =
                        Number(
                          reward.rewardAmount ||
                          reward.rewardPerWorker ||
                          REWARD_PER_WORKER
                        );

                      return (
                        total +
                        amount
                      );
                    },
                    0
                  )
                  .toFixed(2)
              );


            const expectedPaise =
              Math.round(
                totalGrossAmount * 100
              );


            if (
              Number(
                razorpayOrder.amount
              ) !==
              expectedPaise
            ) {

              throw new Error(
                `Payment amount mismatch. Expected ₹${totalGrossAmount}, Razorpay order is ₹${(
                  Number(
                    razorpayOrder.amount
                  ) / 100
                ).toFixed(2)}`
              );
            }


            let totalAdminCommission =
              0;

            let totalContractorReward =
              0;

            let paidCount =
              0;


            /* =========================================
               PROCESS EVERY REWARD
            ========================================= */

            for (
              const lockedReward
              of rewards
            ) {

              /*
               * Already Paid protection.
               *
               * If somehow already paid, do not credit
               * the wallet twice.
               */

              if (
                lockedReward.paymentStatus ===
                "Paid"
              ) {

                if (
                  lockedReward.walletCreditStatus !==
                  "Credited"
                ) {

                  throw new Error(
                    `Reward ${lockedReward._id} is already Paid but wallet is not credited`
                  );
                }

                continue;
              }


              if (
                lockedReward.rewardStatus !==
                "Final"
              ) {

                throw new Error(
                  `Reward ${lockedReward._id} is not finalized`
                );
              }


              if (
                lockedReward.adminApprovalStatus !==
                "Approved"
              ) {

                throw new Error(
                  `Reward ${lockedReward._id} is not approved`
                );
              }


              if (
                String(
                  lockedReward.referredTo
                ) !==
                String(contractorId)
              ) {

                throw new Error(
                  `Reward ${lockedReward._id} does not belong to current contractor`
                );
              }


              /* =======================================
                 CALCULATE REWARD
              ======================================= */

              const grossReward =
                Number(
                  lockedReward.rewardAmount ||
                  REWARD_PER_WORKER
                );


              const commissionPercent =
                Number(
                  lockedReward.adminCommissionPercent ||
                  COMMISSION_PERCENT
                );


              const adminCommission =
                Number(
                  (
                    grossReward *
                    commissionPercent /
                    100
                  ).toFixed(2)
                );


              const contractorReward =
                Number(
                  (
                    grossReward -
                    adminCommission
                  ).toFixed(2)
                );


              if (
                !Number.isFinite(
                  grossReward
                ) ||
                grossReward <= 0
              ) {

                throw new Error(
                  `Invalid reward amount for ${lockedReward._id}`
                );
              }


              if (
                !Number.isFinite(
                  contractorReward
                ) ||
                contractorReward <= 0
              ) {

                throw new Error(
                  `Invalid contractor reward for ${lockedReward._id}`
                );
              }


              /* =======================================
                 MARK PAYMENT PAID
              ======================================= */

              lockedReward.rewardPerWorker =
                grossReward;

              lockedReward.rewardAmount =
                grossReward;

              lockedReward.adminCommissionPercent =
                commissionPercent;

              lockedReward.adminCommission =
                adminCommission;

              lockedReward.contractorReward =
                contractorReward;

              lockedReward.paymentStatus =
                "Paid";

              lockedReward.paymentId =
                razorpay_payment_id;

              lockedReward.paymentAmount =
                grossReward;

              lockedReward.paymentCurrency =
                "INR";

              lockedReward.paymentFailureReason =
                "";

              lockedReward.paidAt =
                new Date();

              lockedReward.adminApprovalStatus =
                "Approved";


              await lockedReward.save({
                session
              });


              /* =======================================
                 CREDIT REFERRER WALLET
              ======================================= */

              const walletResult =
                await creditRewardToWallet(
                  lockedReward,
                  session
                );


              if (
                !walletResult ||
                !walletResult.success
              ) {

                throw new Error(
                  `Wallet credit failed for reward ${lockedReward._id}`
                );
              }


              totalAdminCommission =
                Number(
                  (
                    totalAdminCommission +
                    adminCommission
                  ).toFixed(2)
                );


              totalContractorReward =
                Number(
                  (
                    totalContractorReward +
                    contractorReward
                  ).toFixed(2)
                );


              paidCount++;
            }


            result = {

              rewardCount:
                rewards.length,

              paidCount,

              totalGrossAmount,

              totalAdminCommission,

              totalContractorReward,

              paymentStatus:
                "Paid",

              walletCreditStatus:
                "Credited",

              paymentId:
                razorpay_payment_id
            };
          }
        );

      } finally {

        await session.endSession();
      }


      /* =================================================
         RESPONSE

         IMPORTANT:
         RECORDS ARE NOT DELETED.
      ================================================= */

      return res.json({

        success: true,

        message:
          "Total payment verified and all eligible rewards credited. Payment records have been preserved.",

        batch: {

          orderId:
            razorpay_order_id,

          paymentId:
            result.paymentId,

          rewardCount:
            result.rewardCount,

          paidCount:
            result.paidCount,

          totalGrossAmount:
            result.totalGrossAmount,

          totalAdminCommission:
            result.totalAdminCommission,

          totalContractorReward:
            result.totalContractorReward,

          paymentStatus:
            result.paymentStatus,

          walletCreditStatus:
            result.walletCreditStatus,

          recordsDeleted:
            false
        }
      });

    } catch (error) {

      console.error(
        "VERIFY BATCH PAYMENT ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Unable to verify total reward payment"
      });
    }
  }
);


/* =====================================================
   VERIFY SINGLE RAZORPAY PAYMENT

   OLD / COMPATIBILITY ROUTE

   IMPORTANT:
   PAYMENT RECORD IS NOW PRESERVED.
===================================================== */

router.post(
  "/reward-payment/verify",
  auth,
  async (req, res) => {

    try {

      const {
        rewardId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = req.body;


      if (
        !rewardId ||
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Incomplete payment verification data"
        });
      }


      const reward =
        await MonthlyRewardVerification
          .findById(rewardId);


      if (!reward) {

        return res.status(404).json({
          success: false,
          message:
            "Reward record not found"
        });
      }


      const contractorId =
        req.contractor._id ||
        req.contractor.id;


      if (
        String(
          reward.referredTo
        ) !==
        String(contractorId)
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Only receiving contractor can verify this payment"
        });
      }


      if (
        reward.paymentStatus ===
        "Paid"
      ) {

        return res.json({

          success: true,

          message:
            "Payment already verified",

          reward: {

            id:
              reward._id,

            paymentStatus:
              "Paid",

            walletCreditStatus:
              reward.walletCreditStatus,

            paymentId:
              reward.paymentId,

            paidAt:
              reward.paidAt
          }
        });
      }


      if (
        reward.paymentOrderId !==
        razorpay_order_id
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Payment order mismatch"
        });
      }


      if (!RAZORPAY_KEY_SECRET) {

        return res.status(500).json({
          success: false,
          message:
            "Razorpay secret is not configured"
        });
      }


      /* =================================================
         VERIFY SIGNATURE
      ================================================= */

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            RAZORPAY_KEY_SECRET
          )
          .update(
            `${razorpay_order_id}|${razorpay_payment_id}`
          )
          .digest("hex");


      const expectedBuffer =
        Buffer.from(
          generatedSignature,
          "utf8"
        );

      const receivedBuffer =
        Buffer.from(
          razorpay_signature,
          "utf8"
        );


      if (
        expectedBuffer.length !==
        receivedBuffer.length
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment signature"
        });
      }


      const signatureValid =
        crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer
        );


      if (!signatureValid) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment signature"
        });
      }


      /* =================================================
         DATABASE TRANSACTION
      ================================================= */

      const session =
        await MonthlyRewardVerification
          .db
          .startSession();


      let result = null;


      try {

        await session.withTransaction(
          async () => {

            const lockedReward =
              await MonthlyRewardVerification
                .findById(
                  rewardId
                )
                .session(session);


            if (!lockedReward) {

              throw new Error(
                "Reward record not found"
              );
            }


            if (
              lockedReward.paymentStatus ===
              "Paid"
            ) {

              result = {

                alreadyPaid:
                  true,

                rewardId:
                  String(
                    lockedReward._id
                  ),

                contractorReward:
                  Number(
                    lockedReward.contractorReward ||
                    0
                  )
              };

              return;
            }


            const grossReward =
              Number(
                lockedReward.rewardAmount ||
                REWARD_PER_WORKER
              );


            const commissionPercent =
              Number(
                lockedReward.adminCommissionPercent ||
                COMMISSION_PERCENT
              );


            const adminCommission =
              Number(
                (
                  grossReward *
                  commissionPercent /
                  100
                ).toFixed(2)
              );


            const contractorReward =
              Number(
                (
                  grossReward -
                  adminCommission
                ).toFixed(2)
              );


            if (
              !Number.isFinite(
                grossReward
              ) ||
              grossReward <= 0
            ) {

              throw new Error(
                "Invalid reward amount"
              );
            }


            if (
              !Number.isFinite(
                contractorReward
              ) ||
              contractorReward <= 0
            ) {

              throw new Error(
                "Invalid contractor reward"
              );
            }


            /* =========================================
               UPDATE PAYMENT DETAILS
            ========================================= */

            lockedReward.rewardPerWorker =
              grossReward;

            lockedReward.rewardAmount =
              grossReward;

            lockedReward.adminCommissionPercent =
              commissionPercent;

            lockedReward.adminCommission =
              adminCommission;

            lockedReward.contractorReward =
              contractorReward;

            lockedReward.paymentStatus =
              "Paid";

            lockedReward.paymentId =
              razorpay_payment_id;

            lockedReward.paymentAmount =
              grossReward;

            lockedReward.paymentCurrency =
              "INR";

            lockedReward.paymentFailureReason =
              "";

            lockedReward.paidAt =
              new Date();

            lockedReward.adminApprovalStatus =
              "Approved";


            await lockedReward.save({
              session
            });


            /* =========================================
               CREDIT REFERRER WALLET
            ========================================= */

            const walletResult =
              await creditRewardToWallet(
                lockedReward,
                session
              );


            if (
              !walletResult ||
              !walletResult.success
            ) {

              throw new Error(
                "Wallet credit failed"
              );
            }


            /*
             * IMPORTANT
             *
             * DO NOT DELETE RECORD.
             *
             * Payment history remains permanently
             * in MonthlyRewardVerification.
             */

            result = {

              alreadyPaid:
                false,

              rewardId:
                String(
                  lockedReward._id
                ),

              grossReward,

              adminCommission,

              contractorReward,

              paymentStatus:
                "Paid",

              walletCreditStatus:
                "Credited",

              paymentId:
                razorpay_payment_id,

              paidAt:
                lockedReward.paidAt,

              deleted:
                false
            };
          }
        );

      } finally {

        await session.endSession();
      }


      if (
        result &&
        result.alreadyPaid
      ) {

        return res.json({

          success: true,

          message:
            "Payment already verified",

          reward: {

            id:
              result.rewardId,

            paymentStatus:
              "Paid",

            contractorReward:
              result.contractorReward,

            deleted:
              false
          }
        });
      }


      return res.json({

        success: true,

        message:
          "Payment verified and reward credited to wallet. Payment record preserved.",

        reward: {

          id:
            result.rewardId,

          grossReward:
            result.grossReward,

          adminCommission:
            result.adminCommission,

          contractorReward:
            result.contractorReward,

          paymentStatus:
            result.paymentStatus,

          walletCreditStatus:
            result.walletCreditStatus,

          paymentId:
            result.paymentId,

          paidAt:
            result.paidAt,

          deleted:
            false
        }
      });

    } catch (error) {

      console.error(
        "VERIFY PAYMENT ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Unable to verify payment"
      });
    }
  }
);


/* =====================================================
   ADMIN — ALL REWARD PAYMENTS
===================================================== */

router.get(
  "/admin/payments",
  adminAuth,
  async (req, res) => {

    try {

      const {
        status,
        month,
        search
      } = req.query;


      const filter = {};


      if (
        status &&
        status !== "All"
      ) {

        filter.paymentStatus =
          status;
      }


      if (month) {

        const [
          year,
          monthNumber
        ] =
          String(month)
            .split("-")
            .map(Number);


        if (
          Number.isInteger(year) &&
          Number.isInteger(monthNumber) &&
          monthNumber >= 1 &&
          monthNumber <= 12
        ) {

          const start =
            new Date(
              Date.UTC(
                year,
                monthNumber - 1,
                1
              )
            );


          const end =
            new Date(
              Date.UTC(
                year,
                monthNumber,
                1
              )
            );


          filter.updatedAt = {
            $gte: start,
            $lt: end
          };
        }
      }


      if (search) {

        const regex =
          new RegExp(
            String(search)
              .trim()
              .replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              ),
            "i"
          );


        filter.$or = [

          {
            workerName:
              regex
          },

          {
            workerMobile:
              regex
          },

          {
            paymentOrderId:
              regex
          },

          {
            paymentId:
              regex
          }
        ];
      }


      const payments =
        await MonthlyRewardVerification
          .find(filter)
          .populate(
            "referredBy",
            "name email mobile companyName"
          )
          .populate(
            "referredTo",
            "name email mobile companyName"
          )
          .sort({
            updatedAt: -1
          })
          .limit(500)
          .lean();


      const summary = {

        total:
          payments.length,

        paid:
          payments.filter(
            item =>
              item.paymentStatus ===
              "Paid"
          ).length,

        pending:
          payments.filter(
            item =>
              item.paymentStatus ===
                "Pending" ||
              item.paymentStatus ===
                "Not Started"
          ).length,

        failed:
          payments.filter(
            item =>
              item.paymentStatus ===
              "Failed"
          ).length,

        grossAmount:
          Number(
            payments
              .filter(
                item =>
                  item.paymentStatus ===
                  "Paid"
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.rewardAmount ||
                    0
                  ),
                0
              )
              .toFixed(2)
          ),

        adminCommission:
          Number(
            payments
              .filter(
                item =>
                  item.paymentStatus ===
                  "Paid"
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.adminCommission ||
                    0
                  ),
                0
              )
              .toFixed(2)
          ),

        contractorCredit:
          Number(
            payments
              .filter(
                item =>
                  item.paymentStatus ===
                  "Paid"
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.contractorReward ||
                    0
                  ),
                0
              )
              .toFixed(2)
          )
      };


      return res.json({

        success: true,

        summary,

        payments
      });

    } catch (error) {

      console.error(
        "ADMIN PAYMENTS ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to load payment records"
      });
    }
  }
);


/* =====================================================
   WITHDRAWAL REQUEST
===================================================== */

router.post(
  "/withdraw",
  auth,
  async (req, res) => {

    const session =
      await Wallet.startSession();

    try {

      const {
        amount,
        paymentMethod,
        upiId,
        accountHolderName,
        accountNumber,
        ifsc,
        bankName
      } = req.body;


      const withdrawalAmount =
        Number(amount);


      if (
        !Number.isFinite(
          withdrawalAmount
        ) ||
        withdrawalAmount <
          MIN_WITHDRAWAL
      ) {

        return res.status(400).json({

          success: false,

          message:
            `Minimum withdrawal is ₹${MIN_WITHDRAWAL}`
        });
      }


      if (
        !["UPI", "BANK"]
          .includes(paymentMethod)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid payment method"
        });
      }


      if (
        paymentMethod === "UPI" &&
        !String(
          upiId || ""
        ).trim()
      ) {

        return res.status(400).json({

          success: false,

          message:
            "UPI ID is required"
        });
      }


      if (
        paymentMethod === "BANK" &&
        (
          !String(
            accountHolderName || ""
          ).trim() ||

          !String(
            accountNumber || ""
          ).trim() ||

          !String(
            ifsc || ""
          ).trim()
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Complete bank details are required"
        });
      }


      const contractorId =
        req.contractor._id ||
        req.contractor.id;


      await session.withTransaction(
        async () => {

          const wallet =
            await Wallet.findOne({
              contractorId
            }).session(session);


          if (!wallet) {

            throw new Error(
              "Wallet not found"
            );
          }


          const available =
            Number(
              wallet.availableBalance || 0
            );


          if (
            available <
            withdrawalAmount
          ) {

            throw new Error(
              "Insufficient wallet balance"
            );
          }


          const before =
            available;


          const after =
            Number(
              (
                available -
                withdrawalAmount
              ).toFixed(2)
            );


          wallet.availableBalance =
            after;

          wallet.pendingBalance =
            Number(
              (
                Number(
                  wallet.pendingBalance || 0
                ) +
                withdrawalAmount
              ).toFixed(2)
            );


          await wallet.save({
            session
          });


          const withdrawal =
            await WithdrawalRequest
              .create(
                [
                  {

                    contractorId,

                    amount:
                      withdrawalAmount,

                    paymentMethod,

                    upiId:
                      String(
                        upiId || ""
                      ).trim(),

                    accountHolderName:
                      String(
                        accountHolderName || ""
                      ).trim(),

                    accountNumber:
                      String(
                        accountNumber || ""
                      ).trim(),

                    ifsc:
                      String(
                        ifsc || ""
                      )
                      .trim()
                      .toUpperCase(),

                    bankName:
                      String(
                        bankName || ""
                      ).trim(),

                    status:
                      "Pending"
                  }
                ],
                {
                  session
                }
              );


          await WalletTransaction.create(
            [
              {

                contractorId,

                type:
                  "Withdrawal",

                direction:
                  "Debit",

                amount:
                  withdrawalAmount,

                balanceBefore:
                  before,

                balanceAfter:
                  after,

                description:
                  "Wallet withdrawal request",

                referenceId:
                  String(
                    withdrawal[0]._id
                  ),

                referenceType:
                  "WithdrawalRequest",

                status:
                  "Pending"
              }
            ],
            {
              session
            }
          );
        }
      );


      return res.json({

        success: true,

        message:
          "Withdrawal request submitted"
      });

    } catch (error) {

      console.error(
        "WITHDRAW ERROR:",
        error
      );

      return res.status(400).json({

        success: false,

        message:
          error.message ||
          "Unable to create withdrawal"
      });

    } finally {

      await session.endSession();
    }
  }
);


/* =====================================================
   MY WITHDRAWALS
===================================================== */

router.get(
  "/withdrawals",
  auth,
  async (req, res) => {

    try {

      const contractorId =
        req.contractor._id ||
        req.contractor.id;


      const withdrawals =
        await WithdrawalRequest
          .find({
            contractorId
          })
          .sort({
            createdAt: -1
          })
          .limit(100);


      return res.json({

        success: true,

        withdrawals
      });

    } catch (error) {

      console.error(
        "GET WITHDRAWALS ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to load withdrawals"
      });
    }
  }
);


/* =====================================================
   EXPORT
===================================================== */

router.creditRewardToWallet =
  creditRewardToWallet;


module.exports = router;
