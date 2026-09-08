// ============================================================================
// FIREBASE CONFIG
// Replace every value below with the config from your own free Firebase
// project (Realtime Database). See README.md for step-by-step instructions.
// This file is shared by host.html and watch.html.
// ============================================================================
window.ARENA_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Where in the database this game's state lives. No need to change this
// unless you want multiple independent games in the same Firebase project.
window.ARENA_DB_PATH = "games/current";
