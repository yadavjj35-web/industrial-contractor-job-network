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


/* =====================================================
   RAZORPAY
===================================================== */

const razorpay =
  new Razorpay({
    key_id:
      process.env.RAZORPAY_KEY_ID,

    key_secret:
      process.env.RAZORPAY_KEY_SECRET
  });


/* =====================================================
   SETTINGS
===================================================== */

const MIN_WITHDRAWAL = 100;

const REWARD_PER_WORKER =
  Number(
    process.env.WALLET_REWARD_PER_WORKER ||
    500
  );

const COMMISSION_PERCENT =
  Number(
    process.env.WALLET_ADMIN_COMMISSION_PERCENT ||
    10
  );


/* =====================================================
   HELPER
   Credit reward to referrer wallet

   IMPORTANT:
   This function is IDEMPOTENT.

   Same reward cannot be credited twice.
===================================================== */

async function creditRewardToWallet(
  reward,
  session
) {

  /* ---------------------------------------------------
     Already credited
  --------------------------------------------------- */

  if (
    reward.walletCreditStatus ===
    "Credited"
  ) {

    return {
      alreadyCredited: true,

      amount:
        Number(
          reward.contractorReward || 0
        ),

      transactionId:
        reward.walletTransactionId || null
    };
  }


  /* ---------------------------------------------------
     Payment must be completed
  --------------------------------------------------- */

  if (
    reward.paymentStatus !==
    "Paid"
  ) {

    throw new Error(
      "Payment is not completed"
    );
  }


  /* ---------------------------------------------------
     Reward must be final
  --------------------------------------------------- */

  if (
    reward.rewardStatus !==
    "Final"
  ) {

    throw new Error(
      "Reward is not finalized"
    );
  }


  /* ---------------------------------------------------
     Admin approval
  --------------------------------------------------- */

  if (
    reward.adminApprovalStatus !==
    "Approved"
  ) {

    throw new Error(
      "Reward is not approved"
    );
  }


  /* ---------------------------------------------------
     Amount
  --------------------------------------------------- */

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


  /* ---------------------------------------------------
     Unique reference

     Example:
     REWARD_68xxxxxxxx
  --------------------------------------------------- */

  const referenceId =
    `REWARD_${reward._id}`;


  /* ---------------------------------------------------
     Check existing ledger transaction

     This protects against:
     - double click
     - duplicate callback
     - retry
     - server restart
  --------------------------------------------------- */

  const existingTransaction =
    await WalletTransaction
      .findOne({
        contractorId:
          reward.referredBy,

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
      alreadyCredited: true,

      amount,

      transactionId:
        existingTransaction._id
    };
  }


  /* ---------------------------------------------------
     Get wallet
  --------------------------------------------------- */

  let wallet =
    await Wallet
      .findOne({
        contractorId:
          reward.referredBy
      })
      .session(session);


  /* ---------------------------------------------------
     Create wallet if missing
  --------------------------------------------------- */

  if (!wallet) {

    wallet =
      new Wallet({
        contractorId:
          reward.referredBy,

        availableBalance:
          0,

        pendingBalance:
          0,

        totalEarned:
          0,

        totalWithdrawn:
          0
      });

    await wallet.save({
      session
    });
  }


  /* ---------------------------------------------------
     Balance calculation
  --------------------------------------------------- */

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


  /* ---------------------------------------------------
     Update wallet
  --------------------------------------------------- */

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


  /* ---------------------------------------------------
     Create ledger transaction
  --------------------------------------------------- */

  const transaction =
    await WalletTransaction.create(
      [
        {
          contractorId:
            reward.referredBy,

          type:
            "Reward",

          direction:
            "Credit",

          amount,

          balanceBefore,

          balanceAfter,

          description:
            `Monthly referral reward - ${reward.workerName}`,

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

            referralId:
              String(
                reward.referralId
              ),

            grossReward:
              Number(
                reward.rewardAmount || 0
              ),

            adminCommission:
              Number(
                reward.adminCommission || 0
              )
          }
        }
      ],
      {
        session
      }
    );


  /* ---------------------------------------------------
     Update reward record
  --------------------------------------------------- */

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


  return {
    alreadyCredited: false,

    amount,

    transactionId:
      transaction[0]._id
  };
}


/* =====================================================
   GET WALLET
===================================================== */

router.get(
  "/",
  auth,
  async (req, res) => {

    try {

      let wallet =
        await Wallet.findOne({
          contractorId:
            req.contractor._id
        });

      if (!wallet) {

        wallet =
          await Wallet.create({
            contractorId:
              req.contractor._id,

            availableBalance:
              0,

            pendingBalance:
              0,

            totalEarned:
              0,

            totalWithdrawn:
              0
          });
      }

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
   WALLET TRANSACTION HISTORY
===================================================== */

router.get(
  "/transactions",
  auth,
  async (req, res) => {

    try {

      const transactions =
        await WalletTransaction
          .find({
            contractorId:
              req.contractor._id
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
        "TRANSACTIONS ERROR:",
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
   CREATE RAZORPAY ORDER

   Receiving contractor pays ContractorHub.
===================================================== */

router.post(
  "/reward-payment/order",
  auth,
  async (req, res) => {

    try {

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
          .findById(
            rewardId
          );


      if (!reward) {

        return res.status(404).json({
          success: false,
          message:
            "Reward record not found"
        });
      }


      /* -----------------------------------------------
         Only receiving contractor can pay
      ----------------------------------------------- */

      if (
        String(
          reward.referredTo
        ) !==
        String(
          req.contractor._id
        )
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Only receiving contractor can make this payment"
        });
      }


      /* -----------------------------------------------
         Reward finalized
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         Admin approval
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         Already paid
      ----------------------------------------------- */

      if (
        reward.paymentStatus ===
        "Paid"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Payment already completed"
        });
      }


      /* -----------------------------------------------
         Existing pending order

         Return same order instead of creating
         another payment order.
      ----------------------------------------------- */

      if (
        reward.paymentStatus ===
        "Pending" &&
        reward.paymentOrderId
      ) {

        return res.json({
          success: true,

          existing: true,

          order: {
            id:
              reward.paymentOrderId,

            amount:
              Math.round(
                Number(
                  reward.paymentAmount ||
                  reward.rewardAmount ||
                  REWARD_PER_WORKER
                ) * 100
              ),

            currency:
              "INR"
          },

          key:
            process.env.RAZORPAY_KEY_ID
        });
      }


      /* -----------------------------------------------
         Amount
      ----------------------------------------------- */

      const amount =
        Number(
          reward.rewardAmount ||
          REWARD_PER_WORKER
        );


      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid reward amount"
        });
      }


      /* -----------------------------------------------
         Create Razorpay order
      ----------------------------------------------- */

      const order =
        await razorpay.orders.create({

          amount:
            Math.round(
              amount * 100
            ),

          currency:
            "INR",

          receipt:
            `MR_${reward._id}`,

          notes: {

            rewardId:
              String(
                reward._id
              ),

            contractorId:
              String(
                req.contractor._id
              ),

            referredBy:
              String(
                reward.referredBy
              ),

            workerName:
              reward.workerName ||
              ""
          }
        });


      /* -----------------------------------------------
         Save payment state
      ----------------------------------------------- */

      reward.paymentStatus =
        "Pending";

      reward.paymentOrderId =
        order.id;

      reward.paymentAmount =
        amount;

      reward.paymentCurrency =
        "INR";

      reward.paymentFailureReason =
        "";

      await reward.save();


      return res.json({

        success: true,

        existing: false,

        order: {

          id:
            order.id,

          amount:
            order.amount,

          currency:
            order.currency
        },

        key:
          process.env.RAZORPAY_KEY_ID
      });

    } catch (error) {

      console.error(
        "RAZORPAY ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to create payment order"
      });
    }
  }
);


/* =====================================================
   VERIFY RAZORPAY PAYMENT

   Successful payment
        ↓
   Wallet credit

   Wallet credit is idempotent.
===================================================== */

router.post(
  "/reward-payment/verify",
  auth,
  async (req, res) => {

    const session =
      await MonthlyRewardVerification
        .startSession();


    try {

      const {
        rewardId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = req.body;


      /* -----------------------------------------------
         Validation
      ----------------------------------------------- */

      if (
        !rewardId ||
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Payment verification data incomplete"
        });
      }


      /* -----------------------------------------------
         Find reward
      ----------------------------------------------- */

      const reward =
        await MonthlyRewardVerification
          .findById(
            rewardId
          );


      if (!reward) {

        return res.status(404).json({
          success: false,
          message:
            "Reward not found"
        });
      }


      /* -----------------------------------------------
         Receiving contractor only
      ----------------------------------------------- */

      if (
        String(
          reward.referredTo
        ) !==
        String(
          req.contractor._id
        )
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Unauthorized payment"
        });
      }


      /* -----------------------------------------------
         Order check
      ----------------------------------------------- */

      if (
        reward.paymentOrderId !==
        razorpay_order_id
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment order"
        });
      }


      /* -----------------------------------------------
         Already paid
      ----------------------------------------------- */

      if (
        reward.paymentStatus ===
        "Paid"
      ) {

        return res.json({

          success: true,

          alreadyPaid: true,

          message:
            "Payment already verified",

          contractorReward:
            reward.contractorReward,

          walletCreditStatus:
            reward.walletCreditStatus
        });
      }


      /* -----------------------------------------------
         Verify Razorpay signature
      ----------------------------------------------- */

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
          )
          .update(
            `${razorpay_order_id}|${razorpay_payment_id}`
          )
          .digest("hex");


      const signatureValid =
        crypto.timingSafeEqual(
          Buffer.from(
            generatedSignature,
            "utf8"
          ),
          Buffer.from(
            razorpay_signature,
            "utf8"
          )
        );


      if (!signatureValid) {

        reward.paymentStatus =
          "Failed";

        reward.paymentFailureReason =
          "Invalid Razorpay signature";

        await reward.save();


        return res.status(400).json({
          success: false,
          message:
            "Invalid payment signature"
        });
      }


      /* -----------------------------------------------
         Start transaction
      ----------------------------------------------- */

      await session.startTransaction();


      /* -----------------------------------------------
         Amount
      ----------------------------------------------- */

      const grossAmount =
        Number(
          reward.paymentAmount ||
          reward.rewardAmount ||
          REWARD_PER_WORKER
        );


      /* -----------------------------------------------
         Commission
      ----------------------------------------------- */

      const commissionPercent =
        Number(
          reward.adminCommissionPercent ||
          COMMISSION_PERCENT
        );


      const commission =
        Number(
          (
            grossAmount *
            commissionPercent /
            100
          ).toFixed(2)
        );


      /* -----------------------------------------------
         Referrer reward
      ----------------------------------------------- */

      const contractorReward =
        Number(
          (
            grossAmount -
            commission
          ).toFixed(2)
        );


      /* -----------------------------------------------
         Update payment
      ----------------------------------------------- */

      reward.paymentStatus =
        "Paid";

      reward.paymentId =
        razorpay_payment_id;

      reward.paymentAmount =
        grossAmount;

      reward.paymentCurrency =
        "INR";

      reward.paidAt =
        new Date();

      reward.paymentFailureReason =
        "";

      reward.adminCommission =
        commission;

      reward.contractorReward =
        contractorReward;

      reward.adminApprovalStatus =
        "Approved";


      await reward.save({
        session
      });


      /* -----------------------------------------------
         CREDIT WALLET

         This is idempotent.
      ----------------------------------------------- */

      const walletResult =
        await creditRewardToWallet(
          reward,
          session
        );


      /* -----------------------------------------------
         Commit
      ----------------------------------------------- */

      await session.commitTransaction();


      return res.json({

        success: true,

        alreadyPaid: false,

        message:
          walletResult.alreadyCredited
            ? "Payment verified. Wallet was already credited."
            : "Payment verified and wallet credited.",

        grossAmount,

        adminCommission:
          commission,

        contractorReward,

        walletCreditStatus:
          "Credited",

        walletTransactionId:
          walletResult.transactionId ||
          null
      });


    } catch (error) {

      try {
        await session.abortTransaction();
      } catch (_) {}


      console.error(
        "PAYMENT VERIFY ERROR:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Payment verification failed"
      });

    } finally {

      await session.endSession();
    }
  }
);


/* =====================================================
   WITHDRAWAL REQUEST

   Available wallet balance is immediately reserved.
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


      /* -----------------------------------------------
         Amount validation
      ----------------------------------------------- */

      if (
        !Number.isFinite(
          withdrawalAmount
        ) ||
        withdrawalAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid withdrawal amount"
        });
      }


      if (
        withdrawalAmount <
        MIN_WITHDRAWAL
      ) {

        return res.status(400).json({
          success: false,
          message:
            `Minimum withdrawal is ₹${MIN_WITHDRAWAL}`
        });
      }


      /* -----------------------------------------------
         Payment method
      ----------------------------------------------- */

      if (
        ![
          "UPI",
          "BANK"
        ].includes(
          paymentMethod
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment method"
        });
      }


      /* -----------------------------------------------
         UPI validation
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         Bank validation
      ----------------------------------------------- */

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


      await session.startTransaction();


      /* -----------------------------------------------
         Wallet
      ----------------------------------------------- */

      const wallet =
        await Wallet
          .findOne({
            contractorId:
              req.contractor._id
          })
          .session(session);


      if (!wallet) {

        throw new Error(
          "Wallet not found"
        );
      }


      const available =
        Number(
          wallet.availableBalance || 0
        );


      /* -----------------------------------------------
         Balance check
      ----------------------------------------------- */

      if (
        available <
        withdrawalAmount
      ) {

        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance"
        });
      }


      /* -----------------------------------------------
         New balances
      ----------------------------------------------- */

      const balanceBefore =
        available;

      const balanceAfter =
        Number(
          (
            available -
            withdrawalAmount
          ).toFixed(2)
        );


      /* -----------------------------------------------
         Reserve balance

         Available:
         ₹1000 → ₹500

         Pending:
         ₹0 → ₹500
      ----------------------------------------------- */

      wallet.availableBalance =
        balanceAfter;

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


      /* -----------------------------------------------
         Create withdrawal request
      ----------------------------------------------- */

      const withdrawal =
        await WithdrawalRequest
          .create(
            [
              {
                contractorId:
                  req.contractor._id,

                amount:
                  withdrawalAmount,

                paymentMethod:

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
                  ).trim()
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


      /* -----------------------------------------------
         Ledger entry
      ----------------------------------------------- */

      await WalletTransaction.create(
        [
          {
            contractorId:
              req.contractor._id,

            type:
              "Withdrawal",

            direction:
              "Debit",

            amount:
              withdrawalAmount,

            balanceBefore,

            balanceAfter,

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


      await session.commitTransaction();


      return res.json({

        success: true,

        message:
          "Withdrawal request submitted",

        withdrawal:
          withdrawal[0]
      });


    } catch (error) {

      try {
        await session.abortTransaction();
      } catch (_) {}


      console.error(
        "WITHDRAW ERROR:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Withdrawal failed"
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

      const withdrawals =
        await WithdrawalRequest
          .find({
            contractorId:
              req.contractor._id
          })
          .sort({
            createdAt: -1
          });


      return res.json({
        success: true,
        withdrawals
      });


    } catch (error) {

      console.error(
        "WITHDRAWALS ERROR:",
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


module.exports =
  router;
