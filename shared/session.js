/* =========================================================
   SESSION EXPIRY
   For the first 2 hours after logging in, closing the tab and
   coming back keeps you signed in (normal Firebase persistence).
   After 2 hours, the *next* time the tab is closed, we sign the
   user out — so they stay logged in while the tab is open, but
   have to log in again next visit.
   CAVEAT: this fires on the 'pagehide' event, which browsers do
   not guarantee will finish async work (like signOut) before the
   tab actually closes. It works in the vast majority of normal
   close/navigate-away cases, but isn't a hard guarantee.
   ========================================================= */
window.SchoolSim = window.SchoolSim || {};
const SS_LOGIN_KEY = 'ss_loginAt';
const SS_SESSION_MS = 2 * 60 * 60 * 1000; // 2 hours

window.SchoolSim.markLoginNow = function () {
  localStorage.setItem(SS_LOGIN_KEY, Date.now().toString());
};

window.SchoolSim.getLoginAge = function () {
  const t = parseInt(localStorage.getItem(SS_LOGIN_KEY) || '0', 10);
  if (!t) return Infinity;
  return Date.now() - t;
};

window.SchoolSim.initSessionExpiry = function () {
  window.addEventListener('pagehide', function () {
    if (window.SchoolSim.getLoginAge() >= SS_SESSION_MS) {
      try { auth.signOut(); } catch (e) {}
      localStorage.removeItem(SS_LOGIN_KEY);
    }
  });
};
