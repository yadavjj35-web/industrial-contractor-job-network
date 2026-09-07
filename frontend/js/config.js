const API_URL =
  localStorage.getItem("apiUrl") ||
  "https://industrial-contractor-job-network.onrender.com/api";


/* =====================================
   GET CONTRACTOR TOKEN
===================================== */

function getToken(){

  return localStorage.getItem("token");

}


/* =====================================
   GET ADMIN TOKEN
===================================== */

function getAdminToken(){

  return localStorage.getItem("adminToken");

}


/* =====================================
   API FUNCTION
===================================== */

async function api(
  path,
  options = {},
  admin = false
){

  const headers = {

    "Content-Type":
      "application/json",

    ...(options.headers || {})

  };


  const token =
    admin
      ? getAdminToken()
      : getToken();


  if(token){

    headers.Authorization =
      `Bearer ${token}`;

  }


  const res =
    await fetch(
      API_URL + path,
      {
        ...options,

        headers
      }
    );


  const data =
    await res.json()
      .catch(
        () => ({
          success: false,
          message:
            "Invalid server response"
        })
      );


  /* ===============================
     TOKEN INVALID / EXPIRED
  =============================== */

  if(
    res.status === 401 &&
    !admin
  ){

    localStorage.removeItem("token");

    localStorage.removeItem("contractor");

    location.replace("login.html");

    throw new Error(
      "Session expired. Please login again."
    );

  }


  if(!res.ok){

    throw new Error(
      data.message ||
      "Request failed"
    );

  }


  return data;

}


/* =====================================
   CONTRACTOR LOGOUT
===================================== */

function logout(){

  localStorage.removeItem("token");

  localStorage.removeItem("contractor");

  location.replace("login.html");

}


/* =====================================
   ADMIN LOGOUT
===================================== */

function adminLogout(){

  localStorage.removeItem("adminToken");

  location.replace("admin-login.html");

}


/* =====================================
   REQUIRE LOGIN
===================================== */

function requireLogin(){

  const token =
    getToken();


  if(!token){

    location.replace(
      "login.html"
    );

  }

}


/* =====================================
   REQUIRE ADMIN LOGIN
===================================== */

function requireAdmin(){

  const token =
    getAdminToken();


  if(!token){

    location.replace(
      "admin-login.html"
    );

  }

}
