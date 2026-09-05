const router=require("express").Router();
const Notification=require("../models/Notification");
const auth=require("../middleware/authMiddleware");

router.get("/",auth,async(req,res)=>{
  const notifications=await Notification.find({contractorId:req.contractorId}).sort({createdAt:-1});
  res.json({success:true,notifications});
});
router.patch("/:id/read",auth,async(req,res)=>{
  const n=await Notification.findOneAndUpdate({_id:req.params.id,contractorId:req.contractorId},{isRead:true},{new:true});
  if(!n)return res.status(404).json({success:false,message:"Notification not found"});
  res.json({success:true,notification:n});
});
router.patch("/read-all",auth,async(req,res)=>{
  await Notification.updateMany({contractorId:req.contractorId,isRead:false},{isRead:true});
  res.json({success:true,message:"All notifications marked read"});
});
module.exports=router;
