// ============================================================================
// WATCH — read-only renderer driven entirely by Firebase snapshots.
// No simulation runs here; this just displays whatever host.html last sent.
// ============================================================================
const D = window.HGData;
const AV = window.HGAvatars;
const LOC_MAP = Object.fromEntries(D.LOCATIONS.map(l => [l.id, l]));

const TYPE_ICON = {
  death: '💀', betrayal: '🗡', combat: '⚔', injury: '🩸', alliance: '🤝',
  item: '🎒', sponsor: '🎁', arena: '📯', twist: '🌀', victory: '👑', flavor: '•',
};

const NO_GAME_GRACE_MS = 5 * 60 * 1000;

let latest = null;      // last snapshot received from Firebase
let firebaseOk = true;  // false only if config is missing entirely

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function avatarSrc(p) { return p.avatarUrl || AV.avatarDataURL(p.name); }
function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function phaseLabel(meta) {
  if (!meta) return '—';
  if (meta.phaseType === 'bloodbath') return `Day ${meta.day} — The Bloodbath`;
  return meta.phaseType === 'day' ? `Day ${meta.day}` : `Night ${meta.day}`;
}
function traitChip(t) {
  return `<span class="trait-chip ${t.type}">${esc(t.name)}</span>`;
}

// -------------------------------------------------------------------------
// Active-state logic: decide whether to show "No Game Active"
// -------------------------------------------------------------------------
function isGameConsideredActive(snapshot) {
  if (!snapshot || !snapshot.meta) return false;
  const meta = snapshot.meta;
  if (!meta.ended) return true;
  const elapsed = Date.now() - (meta.lastUpdate || 0);
  return elapsed <= NO_GAME_GRACE_MS;
}

function evaluate() {
  const active = isGameConsideredActive(latest);
  document.getElementById('noGameState').style.display = active ? 'none' : 'block';
  document.getElementById('liveContent').style.display = active ? 'block' : 'none';
  if (!firebaseOk) {
    document.getElementById('noGameState').innerHTML = `
      <div style="font-family:var(--font-display); font-size:24px; color:var(--bone); margin-bottom:8px;">Not Connected</div>
      <div>This page's <code>firebase-config.js</code> hasn't been set up yet.</div>`;
  }
  if (active) renderAll(latest);
  renderHeader();
}

// -------------------------------------------------------------------------
// Rendering
// -------------------------------------------------------------------------
function renderHeader() {
  const meta = latest && latest.meta;
  const livePill = document.getElementById('livePill');
  if (!meta) {
    livePill.className = 'live-pill off';
    livePill.innerHTML = '<span class="pulse-dot"></span>OFFLINE';
    document.getElementById('statPhase').textContent = '';
    document.getElementById('statAlive').textContent = '';
    document.getElementById('statUpdated').textContent = '';
    return;
  }
  const active = isGameConsideredActive(latest);
  livePill.className = 'live-pill ' + (meta.ended ? 'ended' : (active ? 'on' : 'off'));
  livePill.innerHTML = `<span class="pulse-dot"></span>${meta.ended ? 'FINAL' : 'LIVE'}`;
  document.getElementById('statPhase').textContent = phaseLabel(meta);
  document.getElementById('statAlive').textContent = `${meta.aliveCount} / ${meta.totalTributes} remaining`;
  document.getElementById('statUpdated').textContent = `updated ${timeAgo(meta.lastUpdate)}`;
}

function renderAll(snapshot) {
  renderAnnouncement(snapshot);
  renderWinner(snapshot);
  renderMap(snapshot);
  renderRoster(snapshot);
  renderFeed(snapshot);
}

function renderAnnouncement(snapshot) {
  const el = document.getElementById('announcementBanner');
  const a = snapshot.announcement;
  if (a && a.text) {
    el.style.display = 'block';
    el.innerHTML = `<div class="announcement-text">📣 ${esc(a.text)}</div>`;
  } else {
    el.style.display = 'none';
  }
}

function renderWinner(snapshot) {
  const holder = document.getElementById('watchWinnerBanner');
  const meta = snapshot.meta;
  if (!meta.ended) { holder.style.display = 'none'; return; }
  holder.style.display = 'block';
  if (!meta.winner) {
    holder.innerHTML = `<h2>No Victor</h2><p>The arena claimed everyone.</p>`;
    return;
  }
  if (meta.winner.type === 'player') {
    const p = (snapshot.players || []).find(x => x.id === meta.winner.id);
    holder.innerHTML = `${p ? `<img src="${avatarSrc(p)}">` : ''}<h2>${esc(meta.winner.name)}</h2><p>Victor of the Games — survived to Day ${meta.day}.</p>`;
  } else {
    const members = (snapshot.players || []).filter(p => p.teamId === meta.winner.id);
    holder.innerHTML = `<h2>${esc(meta.winner.name)}</h2><p>Victors of the Games, standing together: ${members.map(m => esc(m.name)).join(', ') || '—'}.</p>`;
  }
}

function renderMap(snapshot) {
  const svg = document.getElementById('mapSvg');
  const coords = D.LOCATION_COORDS;
  let edges = '', nodes = '', avatars = '';
  const seen = new Set();
  for (const loc of D.LOCATIONS) {
    for (const c of loc.connections) {
      const key = [loc.id, c].sort().join('-');
      if (seen.has(key)) continue; seen.add(key);
      const a = coords[loc.id], b = coords[c];
      edges += `<line class="map-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }
  }
  const byLoc = {};
  for (const p of (snapshot.players || [])) if (p.alive) (byLoc[p.location] = byLoc[p.location] || []).push(p);
  const locationStatus = snapshot.locationStatus || {};
  for (const loc of D.LOCATIONS) {
    const c = coords[loc.id];
    const hz = locationStatus[loc.id];
    nodes += `<circle class="loc-node ${hz ? 'hazard-' + hz.tag : ''}" cx="${c.x}" cy="${c.y}" r="6"/>`;
    nodes += `<text class="loc-label" x="${c.x}" y="${c.y + 9.5}" text-anchor="middle">${esc(loc.name)}</text>`;
    const here = byLoc[loc.id] || [];
    here.forEach((p, i) => {
      const angle = (i / Math.max(1, here.length)) * Math.PI * 2;
      const rr = here.length > 1 ? 3.2 : 0;
      const px = c.x + Math.cos(angle) * rr;
      const py = c.y + Math.sin(angle) * rr;
      avatars += `<image class="map-avatar" href="${avatarSrc(p)}" x="${px - 2.3}" y="${py - 2.3}" width="4.6" height="4.6"><title>${esc(p.name)}</title></image>`;
    });
  }
  svg.innerHTML = edges + nodes + avatars;
}

function renderRoster(snapshot) {
  const wrap = document.getElementById('rosterStrip');
  const sorted = [...(snapshot.players || [])].sort((a, b) => (b.alive - a.alive) || b.kills - a.kills);
  wrap.innerHTML = sorted.map(p => `
    <div class="roster-chip ${p.alive ? '' : 'dead'}" data-id="${p.id}">
      <img src="${avatarSrc(p)}" alt="">
      <span class="name">${esc(p.name)}</span>
      ${p.kills ? `<span class="kills">${p.kills}⚔</span>` : ''}
    </div>
  `).join('');
}
document.getElementById('rosterStrip').addEventListener('click', (e) => {
  const chip = e.target.closest('.roster-chip'); if (!chip || !latest) return;
  openPlayerModal(chip.dataset.id);
});

let lastFeedGameId = null;
function renderFeed(snapshot) {
  const feed = document.getElementById('feed');
  const entries = [...(snapshot.log || [])].reverse(); // most recent first
  let lastPhase = null;
  let html = '';
  for (const entry of entries) {
    if (entry.phaseIndex !== lastPhase) {
      const label = entry.phase === 'bloodbath' ? `Day ${entry.day} — The Bloodbath` : (entry.phase === 'day' ? `Day ${entry.day}` : `Night ${entry.day}`);
      html += `<div class="phase-divider">${esc(label)}</div>`;
      lastPhase = entry.phaseIndex;
    }
    html += `<div class="feed-entry type-${entry.type}"><span class="tag">${TYPE_ICON[entry.type] || '•'}</span>${esc(entry.text)}</div>`;
  }
  feed.innerHTML = html || '<div class="hint">Nothing has happened yet.</div>';
}

function statBars(p) {
  const rows = [['health', 'HP', p.health], ['hunger', 'Food', p.hunger], ['thirst', 'Water', p.thirst], ['sanity', 'Mind', p.sanity]];
  return `<div>${rows.map(([cls, label, val]) => `
    <div class="statbar-row">
      <span class="statbar-label">${label}</span>
      <span class="statbar-track"><span class="statbar-fill ${cls}" style="width:${val}%"></span></span>
      <span class="statbar-val">${Math.round(val)}</span>
    </div>`).join('')}</div>`;
}

function openPlayerModal(id) {
  const p = (latest.players || []).find(x => x.id === id);
  if (!p) return;
  const mates = (latest.players || []).filter(m => m.teamId && m.teamId === p.teamId && m.id !== p.id);
  const myLog = (latest.log || []).filter(l => l.text.includes(p.name));

  document.getElementById('modalContent').innerHTML = `
    <button class="modal-close small ghost" id="modalCloseBtn">✕</button>
    <div class="modal-head">
      <img src="${avatarSrc(p)}">
      <div>
        <h3>${esc(p.name)}</h3>
        <div>${p.alive ? '<span class="status-pill alive">ALIVE</span>' : `<span class="status-pill dead">Died Day ${p.dayDied} — ${esc(p.causeOfDeath || '')}</span>`}</div>
      </div>
    </div>
    ${p.alive ? statBars(p) : ''}
    <div class="hr"></div>
    <div><b>Traits</b><div style="margin-top:6px;">${(p.traits || []).map(traitChip).join('') || '—'}</div></div>
    <div class="hr"></div>
    <div><b>Location</b> — ${p.alive ? esc(LOC_MAP[p.location] ? LOC_MAP[p.location].name : p.location) : '—'} &nbsp;·&nbsp; <b>Kills</b> — ${p.kills}</div>
    <div class="hr"></div>
    <div><b>Alliance</b> — ${p.teamName ? esc(p.teamName) : 'None'}${mates.length ? ' with ' + mates.map(m => esc(m.name)).join(', ') : ''}</div>
    <div><b>Inventory</b>
      <div class="inv-list">${p.inventory.length ? p.inventory.map(i => `<span class="inv-chip ${i.hidden ? 'hidden-item' : ''}" title="${i.hidden ? 'Kept secret from allies' : ''}">${esc(i.name)}${i.hidden ? ' 🔒' : ''}</span>`).join('') : '<span class="inv-chip">Empty-handed</span>'}</div>
    </div>
    <div class="hr"></div>
    <div><b>Recent Mentions</b>
      <div class="mini-log">${myLog.slice(-30).reverse().map(l => `<div class="feed-entry type-${l.type}"><span class="tag">${TYPE_ICON[l.type] || '•'}</span>${esc(l.text)}</div>`).join('') || '<div class="hint">Nothing notable yet.</div>'}</div>
    </div>
  `;
  document.getElementById('modalBackdrop').classList.add('open');
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
}
function closeModal() { document.getElementById('modalBackdrop').classList.remove('open'); }
document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// -------------------------------------------------------------------------
// INIT
// -------------------------------------------------------------------------
firebaseOk = window.ArenaFirebase.isConfigured();
window.ArenaFirebase.subscribe((data, info) => {
  if (info && info.configured === false) firebaseOk = false;
  latest = data;
  evaluate();
});
setInterval(evaluate, 15000); // keep the 5-minute "no game" clock ticking even without new writes
evaluate();
