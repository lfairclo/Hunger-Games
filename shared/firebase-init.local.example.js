/* =========================================================
   LOCAL TESTING ONLY.
   Copy this file to shared/firebase-init.js and fill in your
   real values to test on your own machine without running the
   GitHub Actions workflow. shared/firebase-init.js is listed in
   .gitignore, so as long as you don't rename this file or force-add
   the real one, it will never get committed.
   ========================================================= */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const ADMIN_EMAIL = "your-email@gmail.com";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
