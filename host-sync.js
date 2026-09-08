// ============================================================================
// HOST SYNC
// Bridges the local simulation (main.js / window.__app) to Firebase so
// watch.html can follow along live. Loaded only by host.html.
// ============================================================================

function traitInfo(id) {
  const t = (window.HGData.TRAITS || []).find(t => t.id === id);
  return t ? { id: t.id, name: t.name, type: t.type } : { id, name: id, type: 'buff' };
}

function resolveWinner(game) {
  if (!game.winner) return null;
  if (game.winner.type === 'player') {
    const p = game.players.find(x => x.id === game.winner.id);
    return { type: 'player', id: game.winner.id, name: p ? p.name : 'Unknown' };
  }
  const t = game.teams.find(x => x.id === game.winner.id);
  return { type: 'team', id: game.winner.id, name: t ? t.name : 'The Alliance' };
}

function buildSnapshot(app) {
  const game = app.game;
  const teamsById = Object.fromEntries(game.teams.map(t => [t.id, t]));
  const alive = game.players.filter(p => p.alive);

  return {
    meta: {
      gameId: game.gameId || 'unknown',
      day: game.day,
      phaseType: game.phaseType,
      phaseIndex: game.phaseIndex,
      ended: !!game.ended,
      winner: resolveWinner(game),
      totalTributes: game.players.length,
      aliveCount: alive.length,
      lastUpdate: Date.now(),
    },
    locationStatus: game.locationStatus || {},
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.pictureData || p.pictureUrl || window.HGAvatars.avatarDataURL(p.avatarSeed || p.name),
      alive: p.alive,
      health: p.health, hunger: p.hunger, thirst: p.thirst, sanity: p.sanity,
      location: p.location,
      kills: p.kills,
      teamId: p.teamId,
      teamName: p.teamId && teamsById[p.teamId] ? teamsById[p.teamId].name : null,
      traits: p.traits.map(traitInfo),
      inventory: p.inventory.map(i => ({ name: i.name, category: i.category, hidden: !!i.hidden })),
      causeOfDeath: p.causeOfDeath,
      dayDied: p.dayDied,
    })),
    // Keep the payload bounded — watchers only need recent history, not the
    // entire game transcript, and this keeps writes small on long games.
    log: game.log.slice(-400).map(l => ({ day: l.day, phase: l.phase, phaseIndex: l.phaseIndex, text: l.text, type: l.type })),
  };
}

let scheduledTimer = null;
let lastSentAt = 0;
let lastSyncedGameId = null;
const MIN_SYNC_GAP_MS = 700;

function setSyncStatus(text) {
  const el = document.getElementById('metaSync');
  if (el) el.textContent = text;
}

function scheduleSync() {
  const app = window.__app;
  if (!app || !app.game) return;

  if (app.game.gameId && app.game.gameId !== lastSyncedGameId) {
    lastSyncedGameId = app.game.gameId;
    window.ArenaFirebase.clearAnnouncement();
    const statusEl = document.getElementById('announcementStatus');
    if (statusEl) statusEl.textContent = '';
  }

  const send = () => {
    lastSentAt = Date.now();
    setSyncStatus('syncing…');
    window.ArenaFirebase.pushGameUpdate(buildSnapshot(app)).then(ok => {
      setSyncStatus(ok ? 'live' : 'not configured');
    });
  };

  const now = Date.now();
  if (now - lastSentAt >= MIN_SYNC_GAP_MS) {
    send();
  } else {
    clearTimeout(scheduledTimer);
    scheduledTimer = setTimeout(send, MIN_SYNC_GAP_MS - (now - lastSentAt));
  }
}

window.onArenaGameUpdate = scheduleSync;

// ----------------------------------------------------------------------------
// Broadcast message controls
// ----------------------------------------------------------------------------
const sendBtn = document.getElementById('btnSendAnnouncement');
const clearBtn = document.getElementById('btnClearAnnouncement');
const input = document.getElementById('announcementInput');
const statusEl = document.getElementById('announcementStatus');

if (sendBtn && input) {
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    const ok = await window.ArenaFirebase.sendAnnouncement(text);
    sendBtn.disabled = false;
    if (ok) { statusEl.textContent = 'Sent to watchers.'; input.value = ''; }
    else statusEl.textContent = 'Could not send — is Firebase configured yet? See README.md.';
  };
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    const ok = await window.ArenaFirebase.clearAnnouncement();
    statusEl.textContent = ok ? 'Cleared.' : 'Could not clear — is Firebase configured yet? See README.md.';
  });
}

setSyncStatus(window.ArenaFirebase && window.ArenaFirebase.isConfigured() ? 'ready' : 'not configured');
