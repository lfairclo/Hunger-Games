// ============================================================================
// FIREBASE CONFIG
// Replace every value below with the config from your own free Firebase
// project (Realtime Database). See README.md for step-by-step instructions.
// This file is shared by host.html and watch.html.
// ============================================================================
window.ARENA_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBYbJ7pLmnMs7NaTKv_ilAnKqyLjf5mjNQ",
  authDomain: "hunger-games-a73c7.firebaseapp.com",
  databaseURL: "https://hunger-games-a73c7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "hunger-games-a73c7",
  storageBucket: "hunger-games-a73c7.firebasestorage.app",
  messagingSenderId: "995321457774",
  appId: "1:995321457774:web:9ab1133dd2198665c3ca7f",
};

// Where in the database this game's state lives. No need to change this
// unless you want multiple independent games in the same Firebase project.
window.ARENA_DB_PATH = "games/current";
