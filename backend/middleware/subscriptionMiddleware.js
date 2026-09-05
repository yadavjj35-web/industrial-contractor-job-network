const Subscription = require("../models/Subscription");
const Usage = require("../models/SubscriptionUsage");
const plans = require("../config/plans");

const monthKey = () => new Date().toISOString().slice(0,7);

module.exports = (field) => async (req, res, next) => {
  try {
    let subscription = await Subscription.findOne({ contractorId:req.contractorId });
    if (!subscription) subscription = await Subscription.create({ contractorId:req.contractorId });

    const plan = plans[subscription.plan] || plans.Free;
    const usage = await Usage.findOneAndUpdate(
      { contractorId:req.contractorId, month:monthKey() },
      { $setOnInsert:{ contractorId:req.contractorId, month:monthKey() } },
      { new:true, upsert:true }
    );

    const limit = plan[field];
    if (limit !== -1 && usage[field] >= limit) {
      return res.status(403).json({ success:false, message:`Monthly ${field} limit reached. Upgrade your plan.` });
    }

    req.subscription = subscription;
    req.usage = usage;
    req.usageField = field;
    next();
  } catch (error) {
    res.status(500).json({ success:false, message:"Subscription validation failed" });
  }
};
