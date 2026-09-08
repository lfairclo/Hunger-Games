// ============================================================================
// FIREBASE CLIENT
// Thin wrapper around the Firebase Realtime Database SDK. Loaded as an ES
// module (so it can import from the CDN); exposes a plain window.ArenaFirebase
// object so the ordinary <script> files (main.js, host-sync.js, watch.js)
// can use it without themselves needing to be modules.
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, update, onValue } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

const cfg = window.ARENA_FIREBASE_CONFIG;
const dbPath = window.ARENA_DB_PATH || "games/current";

let firebaseApp = null;
let db = null;
let ready = false;
let configured = true;

function isConfigured() {
  return !!(cfg && cfg.databaseURL && !String(cfg.databaseURL).includes("YOUR_PROJECT_ID"));
}

function ensureInit() {
  if (ready) return true;
  if (!isConfigured()) {
    configured = false;
    console.warn("Arena: Firebase is not configured yet — edit firebase-config.js with your own project's details.");
    return false;
  }
  try {
    firebaseApp = initializeApp(cfg);
    db = getDatabase(firebaseApp);
    ready = true;
    return true;
  } catch (err) {
    console.error("Arena: Firebase failed to initialize.", err);
    return false;
  }
}

async function pushGameUpdate(partial) {
  if (!ensureInit()) return false;
  try {
    await update(ref(db, dbPath), partial);
    return true;
  } catch (err) {
    console.error("Arena: Firebase sync failed.", err);
    return false;
  }
}

async function sendAnnouncement(text) {
  if (!ensureInit()) return false;
  return pushGameUpdate({ announcement: { text, time: Date.now() } });
}

async function clearAnnouncement() {
  if (!ensureInit()) return false;
  return pushGameUpdate({ announcement: null });
}

// Subscribes to the live game document. Callback receives the raw object (or
// null if nothing is there / Firebase isn't configured). Returns an
// unsubscribe function.
function subscribe(callback) {
  if (!ensureInit()) {
    callback(null, { configured: false });
    return () => {};
  }
  const r = ref(db, dbPath);
  return onValue(
    r,
    (snap) => callback(snap.val(), { configured: true }),
    (err) => { console.error("Arena: Firebase read failed.", err); callback(null, { configured: true, error: err }); }
  );
}

window.ArenaFirebase = { pushGameUpdate, sendAnnouncement, clearAnnouncement, subscribe, ensureInit, isConfigured };
