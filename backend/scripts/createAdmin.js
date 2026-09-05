require("dotenv").config();
const connectDB=require("../config/db");
const Admin=require("../models/Admin");

(async()=>{
  await connectDB();
  const email=(process.env.ADMIN_EMAIL||"admin@example.com").toLowerCase();
  let admin=await Admin.findOne({email});
  if(!admin){
    admin=await Admin.create({
      name:process.env.ADMIN_NAME||"Super Admin",
      email,
      password:process.env.ADMIN_PASSWORD||"ChangeMe123!"
    });
    console.log("Admin created:",admin.email);
  }else console.log("Admin already exists");
  process.exit();
})();
