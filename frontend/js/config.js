const API_URL = localStorage.getItem("apiUrl") || "http://localhost:5000/api";

function getToken(){ return localStorage.getItem("token"); }
function getAdminToken(){ return localStorage.getItem("adminToken"); }

async function api(path, options={}, admin=false){
  const headers={"Content-Type":"application/json",...(options.headers||{})};
  const token=admin?getAdminToken():getToken();
  if(token) headers.Authorization=`Bearer ${token}`;
  const res=await fetch(API_URL+path,{...options,headers});
  const data=await res.json().catch(()=>({success:false,message:"Invalid server response"}));
  if(!res.ok) throw new Error(data.message||"Request failed");
  return data;
}
function logout(){localStorage.removeItem("token");localStorage.removeItem("contractor");location.href="login.html";}
function adminLogout(){localStorage.removeItem("adminToken");location.href="admin-login.html";}
function requireLogin(){if(!getToken())location.href="login.html";}
function requireAdmin(){if(!getAdminToken())location.href="admin-login.html";}
