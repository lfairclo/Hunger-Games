/* =========================================================
   ESCAPE KEY — best-effort "boss key", active on every page.
   Redirects to Google Classroom, tries to close the tab, and
   rigs the back button so it doesn't return here.
   HONEST LIMITS: a web page cannot delete entries from your
   browser's History — browsers deliberately block that. And
   window.close() only actually works on tabs that were opened
   by a script; on a normal tab most browsers will just ignore it.
   ========================================================= */
(function () {
  function escapeBossKey() {
    try { for (let i = 0; i < 6; i++) history.pushState({ trap: true }, '', location.href); } catch (e) {}
    window.addEventListener('popstate', function () {
      window.location.replace('https://classroom.google.com/');
    });
    try { window.close(); } catch (e) {}
    window.location.replace('https://classroom.google.com/');
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') escapeBossKey();
  });
})();
