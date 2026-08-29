// === Anti-FOUC theme bootstrap ===
// Loaded as a parser-blocking classic script from <head> so it runs before the
// first paint. A user whose stored (or OS) preference is 'light' never sees a
// flash of the dark default. Kept in sync with ThemeProvider's resolution logic.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* localStorage/matchMedia unavailable - fall through to CSS defaults */
  }
})();
