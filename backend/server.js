require("dotenv").config();
const express=require("express");
const cors=require("cors");
const rateLimit=require("express-rate-limit");
const connectDB=require("./config/db");

const app=express();
app.use(cors({origin:true}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true,limit:"1mb"}));

const loginLimiter=rateLimit({windowMs:15*60*1000,max:20,message:{success:false,message:"Too many login attempts. Try later."}});
app.use("/api/contractors/login",loginLimiter);
app.use("/api/admin/login",loginLimiter);

app.get("/",(req,res)=>res.json({success:true,message:"Industrial Contractor Job Network API running"}));
app.use("/api/contractors",require("./routes/contractorRoutes"));
app.use("/api/jobs",require("./routes/jobRoutes"));
app.use("/api/referrals",require("./routes/referralRoutes"));
app.use("/api/notifications",require("./routes/notificationRoutes"));
app.use("/api/subscription",require("./routes/subscriptionRoutes"));
app.use("/api/admin",require("./routes/adminRoutes"));

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({success:false,message:"Internal server error"});});

connectDB().then(()=>{
  app.listen(process.env.PORT||5000,()=>console.log(`Server running on ${process.env.PORT||5000}`));
}).catch(err=>{console.error("Database connection failed",err);process.exit(1);});
