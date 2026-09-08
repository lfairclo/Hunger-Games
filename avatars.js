// ============================================================================
// PROCEDURAL AVATARS
// Deterministic, seed-based SVG "tribute emblems" — original geometric marks,
// not photos. Anyone who wants real photos can upload one per tribute instead;
// the generator is the always-available "folder" of fallback art.
// ============================================================================

(function (global) {
  const PALETTES = [
    ['#7a2530', '#e7e2d0'], ['#2f4a3a', '#e7e2d0'], ['#b9964a', '#14170f'],
    ['#37506b', '#e7e2d0'], ['#5c3b6b', '#e7e2d0'], ['#6b5a2f', '#e7e2d0'],
    ['#3d6b5c', '#e7e2d0'], ['#6b2f4a', '#e7e2d0'], ['#2f3a6b', '#e7e2d0'],
    ['#4a6b2f', '#14170f'],
  ];

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  // A handful of wholly original geometric glyphs (no borrowed iconography).
  const GLYPHS = [
    (c) => `<circle cx="50" cy="50" r="22" fill="none" stroke="${c}" stroke-width="4"/><circle cx="50" cy="50" r="6" fill="${c}"/>`,
    (c) => `<polygon points="50,26 74,68 26,68" fill="${c}"/>`,
    (c) => `<path d="M30 66 L50 30 L58 46 L70 26 L66 66 Z" fill="${c}"/>`, // flame-ish
    (c) => `<path d="M22 55 Q36 35 50 55 T78 55" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`, // wave
    (c) => `<polygon points="50,24 62,50 50,76 38,50" fill="${c}"/>`, // diamond
    (c) => `<path d="M50 24 L58 44 L80 44 L62 58 L68 78 L50 66 L32 78 L38 58 L20 44 L42 44 Z" fill="${c}"/>`, // star
    (c) => `<path d="M24 68 L40 40 L50 54 L60 30 L76 68 Z" fill="${c}"/>`, // mountains
    (c) => `<path d="M50 22 C68 30 68 50 50 78 C32 50 32 30 50 22 Z" fill="${c}"/>`, // leaf
    (c) => `<path d="M28 40 Q50 20 72 40 Q60 50 50 44 Q40 50 28 40 Z" fill="${c}"/><path d="M50 44 L50 78" stroke="${c}" stroke-width="4"/>`, // bird
    (c) => `<rect x="30" y="30" width="40" height="40" fill="none" stroke="${c}" stroke-width="4" transform="rotate(45 50 50)"/>`,
  ];

  function avatarSVG(seed, size) {
    size = size || 96;
    const h = hashStr(String(seed));
    const palette = PALETTES[h % PALETTES.length];
    const glyph = GLYPHS[(h >> 3) % GLYPHS.length];
    const rot = (h >> 7) % 360;
    const bg = palette[0], fg = palette[1];
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g${h}" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stop-color="${bg}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${bg}"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill="url(#g${h})"/>
      <g transform="rotate(${rot} 50 50)">${glyph(fg)}</g>
    </svg>`;
  }

  function avatarDataURL(seed, size) {
    const svg = avatarSVG(seed, size);
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  global.HGAvatars = { avatarSVG, avatarDataURL, hashStr };
})(typeof window !== 'undefined' ? window : this);
