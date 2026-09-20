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

const razorpay =
  new Razorpay({
    key_id:
      process.env.RAZORPAY_KEY_ID,

    key_secret:
      process.env.RAZORPAY_KEY_SECRET
  });

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


// --------------------------------------------------
// GET WALLET
// --------------------------------------------------

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
              req.contractor._id
          });
      }

      res.json({
        success: true,
        wallet
      });

    } catch (error) {

      console.error(
        "GET WALLET ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load wallet"
      });
    }
  }
);


// --------------------------------------------------
// TRANSACTION HISTORY
// --------------------------------------------------

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

      res.json({
        success: true,
        transactions
      });

    } catch (error) {

      console.error(
        "TRANSACTIONS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load transactions"
      });
    }
  }
);


// --------------------------------------------------
// CREATE RAZORPAY ORDER
// Receiving contractor pays reward
// --------------------------------------------------

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
          .findById(rewardId);

      if (!reward) {

        return res.status(404).json({
          success: false,
          message:
            "Reward record not found"
        });
      }

      // Only receiving contractor can pay
      if (
        String(reward.referredTo) !==
        String(req.contractor._id)
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Only receiving contractor can make this payment"
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
            "Payment already completed"
        });
      }

      const amount =
        Number(
          reward.rewardAmount ||
          REWARD_PER_WORKER
        );

      if (!amount || amount <= 0) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid reward amount"
        });
      }

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
              String(reward._id),

            contractorId:
              String(req.contractor._id),

            workerName:
              reward.workerName || ""
          }
        });

      reward.paymentStatus =
        "Pending";

      reward.paymentOrderId =
        order.id;

      reward.paymentAmount =
        amount;

      await reward.save();

      res.json({
        success: true,

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

      res.status(500).json({
        success: false,
        message:
          "Unable to create payment order"
      });
    }
  }
);


// --------------------------------------------------
// VERIFY RAZORPAY PAYMENT
// Then credit referrer wallet
// --------------------------------------------------

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

      const reward =
        await MonthlyRewardVerification
          .findById(rewardId);

      if (!reward) {

        return res.status(404).json({
          success: false,
          message:
            "Reward not found"
        });
      }

      // Receiving contractor only
      if (
        String(reward.referredTo) !==
        String(req.contractor._id)
      ) {

        return res.status(403).json({
          success: false,
          message:
            "Unauthorized payment"
        });
      }

      if (
        reward.paymentOrderId !==
        razorpay_order_id
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid order"
        });
      }

      // Already paid
      if (
        reward.paymentStatus ===
        "Paid"
      ) {

        return res.json({
          success: true,
          message:
            "Payment already verified"
        });
      }

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

      if (
        generatedSignature !==
        razorpay_signature
      ) {

        reward.paymentStatus =
          "Failed";

        await reward.save();

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment signature"
        });
      }

      await session.startTransaction();

      const grossAmount =
        Number(
          reward.paymentAmount ||
          reward.rewardAmount ||
          REWARD_PER_WORKER
        );

      const commission =
        Number(
          reward.adminCommission ||
          (
            grossAmount *
            COMMISSION_PERCENT /
            100
          ).toFixed(2)
        );

      const contractorReward =
        Number(
          reward.contractorReward ||
          (
            grossAmount -
            commission
          ).toFixed(2)
        );

      reward.paymentStatus =
        "Paid";

      reward.paymentId =
        razorpay_payment_id;

      reward.paidAt =
        new Date();

      reward.adminCommission =
        commission;

      reward.contractorReward =
        contractorReward;

      reward.adminApprovalStatus =
        "Approved";

      await reward.save({
        session
      });

      // -----------------------------------------
      // Get/Create Referrer Wallet
      // -----------------------------------------

      let wallet =
        await Wallet.findOne({
          contractorId:
            reward.referredBy
        }).session(session);

      if (!wallet) {

        wallet =
          new Wallet({
            contractorId:
              reward.referredBy
          });

        await wallet.save({
          session
        });
      }

      // -----------------------------------------
      // Prevent duplicate wallet credit
      // -----------------------------------------

      const referenceId =
        `REWARD_${reward._id}`;

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

      if (!existingTransaction) {

        const before =
          wallet.availableBalance;

        const after =
          before +
          contractorReward;

        wallet.availableBalance =
          after;

        wallet.totalEarned +=
          contractorReward;

        await wallet.save({
          session
        });

        await WalletTransaction.create(
          [
            {
              contractorId:
                reward.referredBy,

              type:
                "Reward",

              direction:
                "Credit",

              amount:
                contractorReward,

              balanceBefore:
                before,

              balanceAfter:
                after,

              description:
                `Monthly referral reward for ${reward.workerName}`,

              referenceId,

              referenceType:
                "MonthlyRewardVerification",

              status:
                "Completed",

              metadata: {
                rewardId:
                  String(reward._id),

                grossAmount,

                commission
              }
            }
          ],
          {
            session
          }
        );
      }

      reward.paymentStatus =
        "Paid";

      await reward.save({
        session
      });

      await session.commitTransaction();

      res.json({
        success: true,

        message:
          "Payment verified and wallet credited",

        grossAmount,

        adminCommission:
          commission,

        contractorReward:
          contractorReward
      });

    } catch (error) {

      await session.abortTransaction();

      console.error(
        "PAYMENT VERIFY ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Payment verification failed"
      });

    } finally {

      await session.endSession();
    }
  }
);


// --------------------------------------------------
// WITHDRAWAL REQUEST
// --------------------------------------------------

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
        !withdrawalAmount ||
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

      if (
        !["UPI", "BANK"].includes(
          paymentMethod
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Invalid payment method"
        });
      }

      if (
        paymentMethod === "UPI" &&
        !upiId
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
          !accountHolderName ||
          !accountNumber ||
          !ifsc
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Complete bank details are required"
        });
      }

      await session.startTransaction();

      const wallet =
        await Wallet.findOne({
          contractorId:
            req.contractor._id
        }).session(session);

      if (!wallet) {

        throw new Error(
          "Wallet not found"
        );
      }

      if (
        wallet.availableBalance <
        withdrawalAmount
      ) {

        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message:
            "Insufficient wallet balance"
        });
      }

      const before =
        wallet.availableBalance;

      const after =
        before -
        withdrawalAmount;

      // Reserve amount immediately
      wallet.availableBalance =
        after;

      wallet.pendingBalance +=
        withdrawalAmount;

      await wallet.save({
        session
      });

      const withdrawal =
        await WithdrawalRequest
          .create(
            [
              {
                contractorId:
                  req.contractor._id,

                amount:
                  withdrawalAmount,

                paymentMethod,

                upiId:
                  upiId || "",

                accountHolderName:
                  accountHolderName || "",

                accountNumber:
                  accountNumber || "",

                ifsc:
                  ifsc || "",

                bankName:
                  bankName || "",

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
            contractorId:
              req.contractor._id,

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

      await session.commitTransaction();

      res.json({
        success: true,

        message:
          "Withdrawal request submitted",

        withdrawal:
          withdrawal[0]
      });

    } catch (error) {

      await session.abortTransaction();

      console.error(
        "WITHDRAW ERROR:",
        error
      );

      res.status(500).json({
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


// --------------------------------------------------
// MY WITHDRAWALS
// --------------------------------------------------

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

      res.json({
        success: true,
        withdrawals
      });

    } catch (error) {

      res.status(500).json({
        success: false,
        message:
          "Unable to load withdrawals"
      });
    }
  }
);


module.exports = router;
