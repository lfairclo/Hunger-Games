/* =========================================================
   TIME GATE
   Access is only allowed on weekdays before 08:45, after 16:00,
   10:15-10:35 (morning break), or 12:50-14:05 (lunch).
   Weekends are unrestricted (the rule only mentions "during the week").
   NOTE: this reads the visitor's own system clock, so it's a soft
   gate — anyone can get around it by changing their clock. It's meant
   to stop casual playing during lessons, not to be tamper-proof.
   ========================================================= */
window.SchoolSim = window.SchoolSim || {};

window.SchoolSim.isWithinAllowedWindow = function (date) {
  date = date || new Date();
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return true;
  const mins = date.getHours() * 60 + date.getMinutes();
  const windows = [
    [0, 8 * 60 + 45],          // before 8:45
    [16 * 60, 24 * 60],        // after 16:00
    [10 * 60 + 15, 10 * 60 + 35], // 10:15 - 10:35
    [12 * 60 + 50, 14 * 60 + 5],  // 12:50 - 14:05
  ];
  return windows.some(function (w) { return mins >= w[0] && mins < w[1]; });
};

// Call at the top of any protected page. Redirects to sorry.html and
// returns false if outside the allowed window; returns true otherwise.
window.SchoolSim.enforceTimeGate = function () {
  if (!window.SchoolSim.isWithinAllowedWindow()) {
    window.location.replace('sorry.html');
    return false;
  }
  return true;
};

// Re-checks periodically so a page open when a window closes gets
// bounced without needing a manual refresh.
window.SchoolSim.startTimeGateWatcher = function (intervalMs) {
  setInterval(function () { window.SchoolSim.enforceTimeGate(); }, intervalMs || 30000);
};
