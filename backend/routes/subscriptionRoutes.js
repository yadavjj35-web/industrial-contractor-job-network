const router=require("express").Router();
const Subscription=require("../models/Subscription");
const Usage=require("../models/SubscriptionUsage");
const plans=require("../config/plans");
const auth=require("../middleware/authMiddleware");
const month=()=>new Date().toISOString().slice(0,7);

router.get("/",auth,async(req,res)=>{
  let subscription=await Subscription.findOne({contractorId:req.contractorId});
  if(!subscription) subscription=await Subscription.create({contractorId:req.contractorId});
  let usage=await Usage.findOneAndUpdate({contractorId:req.contractorId,month:month()},{ $setOnInsert:{contractorId:req.contractorId,month:month()}},{new:true,upsert:true});
  res.json({success:true,subscription,usage,limits:plans[subscription.plan],plans});
});

// Demo/manual plan change. Replace with payment verification in production.
router.post("/change-plan",auth,async(req,res)=>{
  const plan=req.body.plan;
  if(!plans[plan]) return res.status(400).json({success:false,message:"Invalid plan"});
  const sub=await Subscription.findOneAndUpdate({contractorId:req.contractorId},{
    plan,price:plans[plan].price,status:"Active",startDate:new Date(),
    endDate:new Date(Date.now()+30*24*60*60*1000)
  },{new:true,upsert:true});
  res.json({success:true,message:"Demo plan changed successfully. Add payment gateway before production.",subscription:sub});
});
module.exports=router;
