const router = require("express").Router();

const jwt = require("jsonwebtoken");

const Wallet =
    require("../models/Wallet");

const WalletTransaction =
    require("../models/WalletTransaction");

const WithdrawalRequest =
    require("../models/WithdrawalRequest");

const Contractor =
    require("../models/Contractor");


/* =====================================================
   HELPERS
===================================================== */

function money(value) {

    return Number(
        Number(value || 0).toFixed(2)
    );

}


/* =====================================================
   ADMIN AUTH
===================================================== */

async function adminAuth(req, res, next) {

    try {

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

            _id:
                adminId,

            id:
                adminId,

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
   ADMIN
   GET CUMULATIVE PENDING WITHDRAWALS
===================================================== */

router.get(
    "/admin/withdrawals",
    adminAuth,
    async (req, res) => {

        try {

            const status =
                String(
                    req.query.status ||
                    "Pending"
                );


            let filter = {};


            if (
                status !== "All"
            ) {

                filter.status =
                    status;

            }


            const withdrawalRequests =
                await WithdrawalRequest
                    .find(filter)
                    .sort({
                        createdAt: 1
                    })
                    .lean();


            if (
                !withdrawalRequests.length
            ) {

                return res.json({

                    success: true,

                    summary: {

                        totalContractors: 0,

                        totalRequests: 0,

                        totalAmount: 0

                    },

                    contractors: []

                });

            }


            /* =================================================
               GET CONTRACTOR IDS
            ================================================= */

            const contractorIds = [

                ...new Set(

                    withdrawalRequests
                        .map(item =>
                            item.contractorId
                                ? String(
                                    item.contractorId
                                )
                                : null
                        )
                        .filter(Boolean)

                )

            ];


            const contractors =
                await Contractor
                    .find({
                        _id: {
                            $in:
                                contractorIds
                        }
                    })
                    .select(
                        "name mobile email companyName"
                    )
                    .lean();


            const contractorMap =
                new Map();


            contractors.forEach(
                contractor => {

                    contractorMap.set(
                        String(
                            contractor._id
                        ),
                        contractor
                    );

                }
            );


            /* =================================================
               GROUP BY CONTRACTOR
            ================================================= */

            const grouped =
                new Map();


            withdrawalRequests.forEach(
                request => {

                    const contractorId =
                        String(
                            request.contractorId
                        );


                    if (
                        !grouped.has(
                            contractorId
                        )
                    ) {

                        grouped.set(
                            contractorId,
                            {

                                contractorId,

                                totalPayable: 0,

                                requestCount: 0,

                                requests: [],

                                paymentMethods:
                                    new Set(),

                                latestRequest:
                                    null

                            }
                        );

                    }


                    const group =
                        grouped.get(
                            contractorId
                        );


                    group.totalPayable =
                        money(
                            group.totalPayable +
                            Number(
                                request.amount || 0
                            )
                        );


                    group.requestCount +=
                        1;


                    group.requests.push({

                        id:
                            String(
                                request._id
                            ),

                        amount:
                            money(
                                request.amount
                            ),

                        status:
                            request.status,

                        paymentMethod:
                            request.paymentMethod,

                        createdAt:
                            request.createdAt

                    });


                    if (
                        request.paymentMethod
                    ) {

                        group.paymentMethods.add(
                            request.paymentMethod
                        );

                    }


                    /*
                     * Latest request contains
                     * latest UPI / bank details.
                     */

                    group.latestRequest =
                        request;

                }
            );


            /* =================================================
               FORMAT RESULT
            ================================================= */

            const result = [];


            for (
                const group
                of grouped.values()
            ) {

                const contractor =
                    contractorMap.get(
                        group.contractorId
                    ) || null;


                const latest =
                    group.latestRequest;


                result.push({

                    contractorId:
                        group.contractorId,


                    contractor: {

                        name:
                            contractor?.name ||
                            contractor?.contractorName ||
                            contractor?.companyName ||
                            "Unknown Contractor",

                        mobile:
                            contractor?.mobile ||
                            "",

                        email:
                            contractor?.email ||
                            "",

                        companyName:
                            contractor?.companyName ||
                            ""

                    },


                    totalPayable:
                        money(
                            group.totalPayable
                        ),


                    requestCount:
                        group.requestCount,


                    paymentMethods:
                        [
                            ...group.paymentMethods
                        ],


                    paymentDetails: {

                        paymentMethod:
                            latest?.paymentMethod ||
                            "",

                        upiId:
                            latest?.upiId ||
                            "",

                        accountHolderName:
                            latest?.accountHolderName ||
                            "",

                        accountNumber:
                            latest?.accountNumber ||
                            "",

                        ifsc:
                            latest?.ifsc ||
                            "",

                        bankName:
                            latest?.bankName ||
                            ""

                    },


                    latestRequestDate:
                        latest?.createdAt ||
                        null,


                    requests:
                        group.requests

                });

            }


            /* =================================================
               SORT HIGHER PAYABLE FIRST
            ================================================= */

            result.sort(
                (a, b) =>
                    b.totalPayable -
                    a.totalPayable
            );


            const totalAmount =
                money(
                    result.reduce(
                        (
                            total,
                            item
                        ) =>
                            total +
                            item.totalPayable,
                        0
                    )
                );


            return res.json({

                success: true,

                summary: {

                    totalContractors:
                        result.length,

                    totalRequests:
                        withdrawalRequests.length,

                    totalAmount

                },

                contractors:
                    result

            });


        } catch (error) {

            console.error(
                "ADMIN WITHDRAWALS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load withdrawal requests"

            });

        }

    }
);


/* =====================================================
   ADMIN
   MARK ALL PENDING WITHDRAWALS OF ONE CONTRACTOR
   AS PAID
===================================================== */

router.put(
    "/admin/withdrawals/:contractorId/pay",
    adminAuth,
    async (req, res) => {

        const session =
            await Wallet.startSession();


        try {

            const contractorId =
                req.params.contractorId;


            if (!contractorId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Contractor ID is required"

                });

            }


            let payoutResult = null;


            await session.withTransaction(
                async () => {

                    /* =========================================
                       GET ALL CURRENT PENDING REQUESTS
                    ========================================= */

                    const pendingRequests =
                        await WithdrawalRequest
                            .find({

                                contractorId,

                                status:
                                    "Pending"

                            })
                            .sort({
                                createdAt: 1
                            })
                            .session(session);


                    /*
                     * IMPORTANT:
                     * We calculate the amount again from DB.
                     *
                     * So even if another request was added
                     * after admin page was opened, the latest
                     * cumulative amount is paid.
                     */

                    if (
                        !pendingRequests.length
                    ) {

                        throw new Error(
                            "No pending withdrawal found for this contractor"
                        );

                    }


                    const totalPayable =
                        money(

                            pendingRequests.reduce(
                                (
                                    total,
                                    request
                                ) =>
                                    total +
                                    Number(
                                        request.amount || 0
                                    ),
                                0
                            )

                        );


                    if (
                        totalPayable <= 0
                    ) {

                        throw new Error(
                            "Invalid pending withdrawal amount"
                        );

                    }


                    /* =========================================
                       GET WALLET
                    ========================================= */

                    const wallet =
                        await Wallet
                            .findOne({
                                contractorId
                            })
                            .session(session);


                    if (!wallet) {

                        throw new Error(
                            "Contractor wallet not found"
                        );

                    }


                    const currentPendingBalance =
                        money(
                            wallet.pendingBalance
                        );


                    /*
                     * Withdrawal requests already moved
                     * money from availableBalance to
                     * pendingBalance.
                     */

                    if (
                        currentPendingBalance +
                        0.01 <
                        totalPayable
                    ) {

                        throw new Error(

                            `Wallet pending balance mismatch. ` +
                            `Pending Balance: ₹${currentPendingBalance}, ` +
                            `Required: ₹${totalPayable}`

                        );

                    }


                    /* =========================================
                       UPDATE WALLET
                    ========================================= */

                    wallet.pendingBalance =
                        money(

                            currentPendingBalance -
                            totalPayable

                        );


                    wallet.totalWithdrawn =
                        money(

                            Number(
                                wallet.totalWithdrawn || 0
                            ) +
                            totalPayable

                        );


                    await wallet.save({
                        session
                    });


                    /* =========================================
                       GET REQUEST IDS
                    ========================================= */

                    const requestIds =
                        pendingRequests.map(
                            request =>
                                request._id
                        );


                    const requestIdStrings =
                        pendingRequests.map(
                            request =>
                                String(
                                    request._id
                                )
                        );


                    /* =========================================
                       MARK WITHDRAWAL REQUESTS PAID
                    ========================================= */

                    const withdrawalUpdate =
                        await WithdrawalRequest
                            .updateMany(

                                {
                                    _id: {
                                        $in:
                                            requestIds
                                    },

                                    status:
                                        "Pending"
                                },

                                {
                                    $set: {
                                        status:
                                            "Paid"
                                    }
                                },

                                {
                                    session
                                }

                            );


                    /* =========================================
                       MARK WALLET TRANSACTIONS COMPLETED
                    ========================================= */

                    const transactionUpdate =
                        await WalletTransaction
                            .updateMany(

                                {

                                    contractorId,

                                    type:
                                        "Withdrawal",

                                    referenceType:
                                        "WithdrawalRequest",

                                    referenceId: {
                                        $in:
                                            requestIdStrings
                                    },

                                    status:
                                        "Pending"

                                },

                                {
                                    $set: {
                                        status:
                                            "Completed"
                                    }
                                },

                                {
                                    session
                                }

                            );


                    payoutResult = {

                        contractorId,

                        amountPaid:
                            totalPayable,

                        requestCount:
                            pendingRequests.length,

                        withdrawalRequestsUpdated:
                            withdrawalUpdate.modifiedCount,

                        transactionsUpdated:
                            transactionUpdate.modifiedCount,

                        pendingBalance:
                            wallet.pendingBalance,

                        totalWithdrawn:
                            wallet.totalWithdrawn

                    };

                }
            );


            return res.json({

                success: true,

                message:
                    `₹${payoutResult.amountPaid} marked as paid successfully`,

                payout:
                    payoutResult

            });


        } catch (error) {

            console.error(
                "ADMIN PAY WITHDRAWAL ERROR:",
                error
            );


            return res.status(400).json({

                success: false,

                message:
                    error.message ||
                    "Unable to mark withdrawal as paid"

            });


        } finally {

            await session.endSession();

        }

    }
);


/* =====================================================
   EXPORT
===================================================== */

module.exports =
    router;
