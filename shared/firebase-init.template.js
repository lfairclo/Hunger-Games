/* =========================================================
   FIREBASE SETUP — this is a TEMPLATE, committed to the repo
   with no real values in it. The GitHub Actions workflow
   (.github/workflows/deploy.yml) copies this to
   shared/firebase-init.js and fills in the __TOKENS__ below
   from your repository secrets at deploy time. See SETUP.md.

   For local testing without running the workflow, copy
   shared/firebase-init.local.example.js to shared/firebase-init.js
   and fill in real values by hand — that file is gitignored so
   you won't accidentally commit real values.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBYbJ7pLmnMs7NaTKv_ilAnKqyLjf5mjNQ",
  authDomain: "hunger-games-a73c7.firebaseapp.com",
  projectId: "hunger-games-a73c7",
  storageBucket: "hunger-games-a73c7.firebasestorage.app",
  messagingSenderId: "995321457774",
  appId: "1:995321457774:web:9ab1133dd2198665c3ca7f",
};

// The Google account allowed to approve users and see admin.html.
// Must match the admin email in your Firestore security rules exactly.
const ADMIN_EMAIL = "lfairowl12@gmail.com";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
