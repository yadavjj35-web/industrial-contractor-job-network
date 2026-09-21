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

const MIN_WITHDRAWAL =
  Number(process.env.MIN_WITHDRAWAL || 100);

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
        message: "Admin authentication required"
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
        message: "Invalid admin token"
      });
    }

    req.adminId = adminId;

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
      message: "Invalid or expired admin token"
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

    wallet = wallet[0];
  }

  return wallet;
}


/* =====================================================
   CREDIT REWARD TO REFERRER WALLET
===================================================== */

async function creditRewardToWallet(
  reward,
  session
) {

  if (
    reward.walletCreditStatus ===
    "Credited"
  ) {

    return {
      success: true,
      alreadyCredited: true,
      amount:
        Number(
          reward.contractorReward || 0
        )
    };
  }


  if (
    reward.paymentStatus !==
    "Paid"
  ) {

    throw new Error(
      "Payment has not been completed"
    );
  }


  if (
    reward.rewardStatus !==
    "Final"
  ) {

    throw new Error(
      "Reward is not finalized"
    );
  }


  if (
    reward.adminApprovalStatus !==
    "Approved"
  ) {

    throw new Error(
      "Reward is not approved"
    );
  }


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


  const contractorId =
    reward.referredBy;


  const referenceId =
    `REWARD_${reward._id}`;


  const existingTransaction =
    await WalletTransaction
      .findOne({
        contractorId,
        referenceId,
        type: "Reward"
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
      transaction:
        existingTransaction
    };
  }


  const wallet =
    await getOrCreateWallet(
      contractorId,
      session
    );


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


  const transaction =
    await WalletTransaction.create(
      [
        {
          contractorId,

          type: "Reward",

          direction: "Credit",

          amount,

          balanceBefore,

          balanceAfter,

          description:
            `Monthly referral reward for ${reward.workerName}`,

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
              reward.workerName,

            workerMobile:
              reward.workerMobile,

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
    success: true,

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
   CREATE RAZORPAY REWARD PAYMENT ORDER
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


      if (
        reward.paymentStatus ===
          "Pending" &&
        reward.paymentOrderId
      ) {

        return res.json({
          success: true,

          key:
            RAZORPAY_KEY_ID,

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
              reward.paymentCurrency ||
              "INR"
          },

          reward
        });
      }


      /*
       * IMPORTANT:
       *
       * Receiver pays GROSS reward.
       *
       * Example:
       * Gross = ₹500
       * Admin  = ₹50
       * Referrer wallet = ₹450
       */

      const grossAmount =
        Number(
          reward.rewardAmount ||
          REWARD_PER_WORKER
        );


      if (
        !Number.isFinite(grossAmount) ||
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


      const order =
        await razorpay.orders.create({
          amount:
            amountInPaise,

          currency:
            "INR",

          receipt:
            `MR_${String(
              reward._id
            ).slice(-20)}`,

          notes: {
            rewardId:
              String(
                reward._id
              ),

            workerName:
              reward.workerName,

            workerMobile:
              reward.workerMobile
          }
        });


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
        success: true,

        key:
          RAZORPAY_KEY_ID,

        order: {
          id:
            order.id,

          amount:
            order.amount,

          currency:
            order.currency
        },

        reward
      });

    } catch (error) {

      console.error(
        "CREATE PAYMENT ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to create payment order"
      });
    }
  }
);


/* =====================================================
   VERIFY RAZORPAY PAYMENT
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

          reward
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


      const session =
        await MonthlyRewardVerification
          .db
          .startSession();


      let result;


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


            await creditRewardToWallet(
              lockedReward,
              session
            );
          }
        );


        result = true;

      } finally {

        await session.endSession();
      }


      const updatedReward =
        await MonthlyRewardVerification
          .findById(
            rewardId
          );


      return res.json({
        success: true,

        message:
          "Payment verified and reward credited to wallet",

        reward: {
          id:
            updatedReward._id,

          workerName:
            updatedReward.workerName,

          grossReward:
            updatedReward.rewardAmount,

          adminCommission:
            updatedReward.adminCommission,

          contractorReward:
            updatedReward.contractorReward,

          paymentStatus:
            updatedReward.paymentStatus,

          walletCreditStatus:
            updatedReward.walletCreditStatus,

          paymentId:
            updatedReward.paymentId
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
        !String(upiId || "").trim()
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
