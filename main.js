// ============================================================================
// APP — wires the engine + data + avatars to the page.
// ============================================================================
(function () {
  const HG = window.HGEngine;
  const D = window.HGData;
  const AV = window.HGAvatars;

  const app = {
    roster: [],           // pre-game cast: {clientId, name, avatarSeed, pictureData, pictureUrl, traits[]}
    game: null,           // live HGEngine state once started
    settings: { teamVictory: false, speed: 1400 },
    autoplayTimer: null,
    lastRenderedLog: 0,
    lastPhaseIndexShown: -1,
    sortKey: 'default',
    sortDir: 1,
    imageConfig: { owner: '', repo: '', path: 'avatars', branch: '', enabled: false },
    imagePool: [],         // shuffled queue of image URLs handed out to new tributes
    imagePoolAll: [],      // full list fetched from the folder
  };

  const TYPE_ICON = {
    death: '💀', betrayal: '🗡', combat: '⚔', injury: '🩸', alliance: '🤝',
    item: '🎒', sponsor: '🎁', arena: '📯', twist: '🌀', victory: '👑', flavor: '•',
  };

  function uid() { return Math.random().toString(36).slice(2, 10); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function avatarSrc(entity) {
    if (entity.pictureData) return entity.pictureData;
    if (entity.pictureUrl) return entity.pictureUrl;
    return AV.avatarDataURL(entity.avatarSeed || entity.name);
  }

  // -------------------------------------------------------------------------
  // PORTRAIT SOURCE — pull random images from a folder in a GitHub repo via
  // the public GitHub Contents API. Falls back to procedural emblems if the
  // folder is missing, empty, unreachable, or the site isn't on GitHub Pages.
  // -------------------------------------------------------------------------
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
  const IMG_CACHE_KEY = 'arenaImageConfigCache';

  function guessGithubLocation() {
    const host = window.location.hostname; // e.g. someuser.github.io
    const m = host.match(/^([^.]+)\.github\.io$/i);
    if (!m) return null;
    const owner = m[1];
    const segments = window.location.pathname.split('/').filter(Boolean);
    // Project pages live at username.github.io/repo/... ; user/org root pages
    // live at username.github.io/ and are served from a repo named exactly
    // "username.github.io".
    const repo = segments.length ? segments[0] : `${owner}.github.io`;
    return { owner, repo };
  }

  function shufflePool() {
    app.imagePool = [...app.imagePoolAll].sort(() => Math.random() - 0.5);
  }

  function nextPoolImage() {
    if (!app.imagePool.length) {
      if (!app.imagePoolAll.length) return null;
      shufflePool();
    }
    return app.imagePool.pop();
  }

  async function fetchGithubFolder(cfg) {
    const branchQuery = cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : '';
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}${branchQuery}`;
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('That path is not a folder');
    return items.filter(i => i.type === 'file' && IMG_EXT.test(i.name)).map(i => i.download_url);
  }

  async function loadImagesFromGithub(cfg, opts) {
    opts = opts || {};
    const statusEl = document.getElementById('portraitStatus');
    if (statusEl) statusEl.textContent = 'Checking GitHub…';
    try {
      const urls = await fetchGithubFolder(cfg);
      app.imagePoolAll = urls;
      shufflePool();
      app.imageConfig = Object.assign({}, cfg, { enabled: urls.length > 0 });
      localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(app.imageConfig));
      if (statusEl) {
        statusEl.textContent = urls.length
          ? `✓ Found ${urls.length} image${urls.length === 1 ? '' : 's'} in "${cfg.path}" — new tributes will use these.`
          : `That folder exists but has no images in it — using generated emblems instead.`;
      }
      if (!opts.silent) renderRoster();
      return urls.length > 0;
    } catch (err) {
      app.imageConfig = Object.assign({}, cfg, { enabled: false });
      if (statusEl) statusEl.textContent = `Couldn't load images from GitHub (${err.message}) — using generated emblems instead.`;
      return false;
    }
  }

  function initPortraitSource() {
    let cfg = { owner: '', repo: '', path: 'avatars', branch: '' };
    try {
      const cached = JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || 'null');
      if (cached && cached.owner) cfg = cached;
    } catch (e) { /* ignore */ }
    if (!cfg.owner) {
      const guess = guessGithubLocation();
      if (guess) cfg = Object.assign(cfg, guess);
    }
    document.getElementById('ghOwner').value = cfg.owner || '';
    document.getElementById('ghRepo').value = cfg.repo || '';
    document.getElementById('ghPath').value = cfg.path || 'avatars';
    document.getElementById('ghBranch').value = cfg.branch || '';
    if (cfg.owner && cfg.repo) loadImagesFromGithub(cfg, { silent: true });
  }

  document.getElementById('btnLoadPortraits').addEventListener('click', () => {
    const cfg = {
      owner: document.getElementById('ghOwner').value.trim(),
      repo: document.getElementById('ghRepo').value.trim(),
      path: document.getElementById('ghPath').value.trim() || 'avatars',
      branch: document.getElementById('ghBranch').value.trim(),
    };
    if (!cfg.owner || !cfg.repo) { alert('Enter at least the GitHub username and repository name.'); return; }
    loadImagesFromGithub(cfg);
  });
  document.getElementById('btnUseGeneratedPortraits').addEventListener('click', () => {
    app.imageConfig.enabled = false;
    app.imagePoolAll = []; app.imagePool = [];
    document.getElementById('portraitStatus').textContent = 'Using generated emblems for new tributes.';
    localStorage.removeItem(IMG_CACHE_KEY);
  });
  document.getElementById('btnShufflePortraits').addEventListener('click', () => {
    if (!app.roster.length) return;
    app.roster.forEach(r => assignPortrait(r, true));
    renderRoster();
  });

  function assignPortrait(entry, force) {
    if (!app.imageConfig.enabled && !app.imagePoolAll.length) {
      if (force) entry.avatarSeed = entry.name + Math.random().toString(36).slice(2, 6);
      entry.pictureUrl = null;
      return;
    }
    const img = nextPoolImage();
    if (img) entry.pictureUrl = img;
  }

  // -------------------------------------------------------------------------
  // NAVIGATION
  // -------------------------------------------------------------------------
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });
  function switchView(name) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'map') renderMap();
    if (name === 'standings') renderStandings();
  }

  // -------------------------------------------------------------------------
  // ROSTER (SETUP)
  // -------------------------------------------------------------------------
  function addRosterEntry(name) {
    const used = new Set(app.roster.map(r => r.name));
    const finalName = name && name.trim() ? name.trim() : D.randomName(used);
    const entry = {
      clientId: uid(),
      name: finalName,
      avatarSeed: finalName + Math.random().toString(36).slice(2, 6),
      pictureData: null,
      pictureUrl: null,
      traits: D.randomTraits(2),
    };
    assignPortrait(entry);
    app.roster.push(entry);
    renderRoster();
  }

  function removeRosterEntry(clientId) {
    app.roster = app.roster.filter(r => r.clientId !== clientId);
    renderRoster();
  }

  function rerollTraits(clientId) {
    const r = app.roster.find(r => r.clientId === clientId);
    if (r) { r.traits = D.randomTraits(2); renderRoster(); }
  }

  function renderRoster() {
    const tbody = document.querySelector('#rosterTable tbody');
    tbody.innerHTML = app.roster.map(r => `
      <tr data-id="${r.clientId}">
        <td><img class="roster-avatar" src="${avatarSrc(r)}" alt=""></td>
        <td><input type="text" class="roster-name-input" data-field="name" value="${esc(r.name)}"></td>
        <td>${r.traits.map(tid => traitChip(tid)).join('')}
          <button class="small ghost" data-action="reroll">⟲</button>
        </td>
        <td>
          <button class="small" data-action="upload">Upload Photo</button>
          <button class="small ghost" data-action="rerollPortrait" title="Pick a different random portrait">🖼⟲</button>
          <input type="file" accept="image/*" data-action="uploadfile" style="display:none;">
        </td>
        <td><button class="small danger ghost" data-action="remove">Remove</button></td>
      </tr>
    `).join('');
    document.getElementById('rosterCount').textContent = app.roster.length;
    document.getElementById('rosterEmpty').style.display = app.roster.length ? 'none' : 'block';
    document.getElementById('metaTotal').textContent = app.roster.length;
  }

  function traitChip(tid) {
    const t = HG.TRAIT_MAP[tid];
    if (!t) return '';
    return `<span class="trait-chip ${t.type}" title="${esc(t.desc)}">${esc(t.name)}</span>`;
  }

  document.getElementById('rosterTable').addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.dataset.action === 'remove') removeRosterEntry(id);
    else if (e.target.dataset.action === 'reroll') rerollTraits(id);
    else if (e.target.dataset.action === 'upload') tr.querySelector('[data-action=uploadfile]').click();
    else if (e.target.dataset.action === 'rerollPortrait') {
      const entry = app.roster.find(r => r.clientId === id);
      if (entry) { entry.pictureData = null; assignPortrait(entry, true); renderRoster(); }
    }
  });
  document.getElementById('rosterTable').addEventListener('change', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const id = tr.dataset.id;
    const entry = app.roster.find(r => r.clientId === id);
    if (!entry) return;
    if (e.target.dataset.field === 'name') entry.name = e.target.value.trim() || entry.name;
    if (e.target.dataset.action === 'uploadfile' && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => { entry.pictureData = reader.result; renderRoster(); };
      reader.readAsDataURL(e.target.files[0]);
    }
  });

  document.getElementById('btnAddSingle').addEventListener('click', () => {
    const input = document.getElementById('singleNameInput');
    if (input.value.trim()) { addRosterEntry(input.value.trim()); input.value = ''; }
  });
  document.getElementById('singleNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnAddSingle').click();
  });
  document.getElementById('btnAddRandom').addEventListener('click', () => {
    const n = Math.max(1, Math.min(200, parseInt(document.getElementById('randomCountInput').value) || 1));
    for (let i = 0; i < n; i++) addRosterEntry();
  });
  document.getElementById('btnBulkAdd').addEventListener('click', () => {
    const ta = document.getElementById('bulkNames');
    ta.value.split('\n').map(s => s.trim()).filter(Boolean).forEach(name => addRosterEntry(name));
    ta.value = '';
  });
  document.getElementById('btnClearRoster').addEventListener('click', () => {
    if (app.roster.length && !confirm('Remove every tribute from the roster?')) return;
    app.roster = []; renderRoster();
  });

  document.getElementById('btnExportRoster').addEventListener('click', () => {
    const data = JSON.stringify({ version: 1, roster: app.roster, settings: app.settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arena-roster.json';
    a.click();
  });
  document.getElementById('btnImportRosterTrigger').addEventListener('click', () => document.getElementById('importRosterFile').click());
  document.getElementById('importRosterFile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const list = Array.isArray(parsed) ? parsed : parsed.roster;
        if (!Array.isArray(list)) throw new Error('bad format');
        app.roster = list.map(r => ({
          clientId: uid(), name: r.name || D.randomName(),
          avatarSeed: r.avatarSeed || r.name, pictureData: r.pictureData || null,
          pictureUrl: r.pictureUrl || null,
          traits: (r.traits && r.traits.length) ? r.traits : D.randomTraits(2),
        }));
        if (parsed.settings) {
          app.settings = Object.assign(app.settings, parsed.settings);
          document.getElementById('teamVictoryToggle').checked = !!app.settings.teamVictory;
        }
        renderRoster();
      } catch (err) {
        alert('Could not read that file — expected an Arena roster export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('teamVictoryToggle').addEventListener('change', (e) => {
    app.settings.teamVictory = e.target.checked;
  });

  document.getElementById('btnStartGames').addEventListener('click', startGame);

  function startGame() {
    if (app.roster.length < 2) { alert('Add at least 2 tributes first.'); return; }
    const rosterInput = app.roster.map(r => ({
      name: r.name, avatarSeed: r.avatarSeed, pictureData: r.pictureData, pictureUrl: r.pictureUrl, traits: r.traits,
    }));
    app.game = HG.createGame(rosterInput, { teamVictory: app.settings.teamVictory, arenaEventChance: 0.30, twistChance: 0.10 });
    app.lastRenderedLog = 0;
    app.lastPhaseIndexShown = -1;
    document.getElementById('feed').innerHTML = '';
    document.getElementById('winnerBannerHolder').innerHTML = '';
    switchView('arena');
    renderPhaseBanner();
    renderNewLogEntries();
    renderRosterStrip();
    updateMeta();
  }

  // -------------------------------------------------------------------------
  // ARENA CONTROLS
  // -------------------------------------------------------------------------
  document.getElementById('btnNextPhase').addEventListener('click', () => stepPhase());
  document.getElementById('btnRunToEnd').addEventListener('click', runToEnd);
  document.getElementById('btnPlay').addEventListener('click', toggleAutoplay);
  document.getElementById('speedSelect').addEventListener('change', (e) => {
    app.settings.speed = parseInt(e.target.value);
    if (app.autoplayTimer) { stopAutoplay(); startAutoplay(); }
  });
  document.getElementById('btnResetGame').addEventListener('click', () => {
    stopAutoplay();
    if (!confirm('End this game and return to Setup? Your roster stays intact.')) return;
    app.game = null;
    switchView('setup');
  });

  function requireGame() {
    if (!app.game) { alert('Start the games from Setup first.'); return false; }
    return true;
  }

  function stepPhase() {
    if (!requireGame()) return;
    if (app.game.ended) { stopAutoplay(); return; }
    HG.advancePhase(app.game);
    renderPhaseBanner();
    renderNewLogEntries();
    renderRosterStrip();
    updateMeta();
    if (app.game.ended) {
      stopAutoplay();
      renderWinnerBanner();
    }
  }

  function runToEnd() {
    if (!requireGame()) return;
    stopAutoplay();
    let guard = 0;
    while (!app.game.ended && guard < 5000) { HG.advancePhase(app.game); guard++; }
    renderPhaseBanner();
    renderNewLogEntries();
    renderRosterStrip();
    updateMeta();
    if (app.game.ended) renderWinnerBanner();
  }

  function toggleAutoplay() {
    if (!requireGame()) return;
    if (app.autoplayTimer) stopAutoplay(); else startAutoplay();
  }
  function startAutoplay() {
    document.getElementById('btnPlay').textContent = '⏸ Pause';
    app.autoplayTimer = setInterval(() => {
      if (!app.game || app.game.ended) { stopAutoplay(); return; }
      stepPhase();
    }, app.settings.speed);
  }
  function stopAutoplay() {
    if (app.autoplayTimer) clearInterval(app.autoplayTimer);
    app.autoplayTimer = null;
    document.getElementById('btnPlay').textContent = '▶ Autoplay';
  }

  function renderPhaseBanner() {
    const el = document.getElementById('phaseBanner');
    if (!app.game) { el.innerHTML = 'Awaiting the games…'; return; }
    const alive = HG.alivePlayers(app.game).length;
    el.innerHTML = `${esc(HG.phaseLabel(app.game))}<div class="n">${alive} tribute${alive === 1 ? '' : 's'} remaining · phase ${app.game.phaseIndex}</div>`;
  }

  function updateMeta() {
    document.getElementById('metaTotal').textContent = app.game ? app.game.players.length : app.roster.length;
    document.getElementById('metaAlive').textContent = app.game ? HG.alivePlayers(app.game).length : '—';
    document.getElementById('metaPhase').textContent = app.game ? HG.phaseLabel(app.game) : '—';
  }

  function renderNewLogEntries() {
    const feed = document.getElementById('feed');
    const entries = app.game.log.slice(app.lastRenderedLog);
    let html = '';
    for (const entry of entries) {
      if (entry.phaseIndex !== app.lastPhaseIndexShown) {
        html += `<div class="phase-divider">${esc(dividerLabel(entry))}</div>`;
        app.lastPhaseIndexShown = entry.phaseIndex;
      }
      html += `<div class="feed-entry type-${entry.type}"><span class="tag">${TYPE_ICON[entry.type] || '•'}</span>${esc(entry.text)}</div>`;
    }
    feed.insertAdjacentHTML('beforeend', html);
    app.lastRenderedLog = app.game.log.length;
    feed.scrollTop = feed.scrollHeight;
  }
  function dividerLabel(entry) {
    if (entry.phase === 'bloodbath') return `Day ${entry.day} — The Bloodbath`;
    return entry.phase === 'day' ? `Day ${entry.day}` : `Night ${entry.day}`;
  }

  function renderRosterStrip() {
    const wrap = document.getElementById('rosterStrip');
    if (!app.game) { wrap.innerHTML = ''; return; }
    const sorted = [...app.game.players].sort((a, b) => (b.alive - a.alive) || b.kills - a.kills);
    wrap.innerHTML = sorted.map(p => `
      <div class="roster-chip ${p.alive ? '' : 'dead'}" data-id="${p.id}">
        <img src="${avatarSrc(p)}" alt="">
        <span class="name">${esc(p.name)}</span>
        ${p.kills ? `<span class="kills">${p.kills}⚔</span>` : ''}
      </div>
    `).join('');
  }
  document.getElementById('rosterStrip').addEventListener('click', (e) => {
    const chip = e.target.closest('.roster-chip'); if (!chip) return;
    openPlayerModal(chip.dataset.id);
  });

  function renderWinnerBanner() {
    const holder = document.getElementById('winnerBannerHolder');
    const w = app.game.winner;
    if (!w) { holder.innerHTML = `<div class="winner-banner"><h2>No Victor</h2><p>The arena claimed everyone. The Games end without a winner.</p></div>`; return; }
    if (w.type === 'player') {
      const p = HG.getPlayer(app.game, w.id);
      holder.innerHTML = `<div class="winner-banner"><img src="${avatarSrc(p)}"><h2>${esc(p.name)}</h2><p>Victor of the Games — ${p.kills} kill${p.kills === 1 ? '' : 's'}, survived to Day ${app.game.day}.</p></div>`;
    } else {
      const team = HG.getTeam(app.game, w.id) || { name: 'The Alliance', memberIds: [] };
      const members = app.game.players.filter(p => w.id && app.game.players.some(x => x.id === p.id) && p.alive);
      holder.innerHTML = `<div class="winner-banner"><h2>${esc(team.name)}</h2><p>Victors of the Games, standing together: ${members.map(m => esc(m.name)).join(', ')}.</p></div>`;
    }
  }

  // -------------------------------------------------------------------------
  // MAP
  // -------------------------------------------------------------------------
  function renderMap() {
    const svg = document.getElementById('mapSvg');
    if (!app.game) { svg.innerHTML = `<text x="50" y="50" text-anchor="middle" class="loc-label" style="font-size:4px;">Start the games to see the map.</text>`; return; }
    const coords = D.LOCATION_COORDS;
    let edges = '', nodes = '', avatars = '';
    const seen = new Set();
    for (const loc of HG.LOCATIONS) {
      for (const c of loc.connections) {
        const key = [loc.id, c].sort().join('-');
        if (seen.has(key)) continue; seen.add(key);
        const a = coords[loc.id], b = coords[c];
        edges += `<line class="map-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
      }
    }
    const byLoc = {};
    for (const p of HG.alivePlayers(app.game)) (byLoc[p.location] = byLoc[p.location] || []).push(p);
    for (const loc of HG.LOCATIONS) {
      const c = coords[loc.id];
      const hz = app.game.locationStatus[loc.id];
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

  // -------------------------------------------------------------------------
  // STANDINGS
  // -------------------------------------------------------------------------
  document.querySelectorAll('#standingsTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      app.sortDir = (app.sortKey === key) ? -app.sortDir : 1;
      app.sortKey = key;
      renderStandings();
    });
  });

  function renderStandings() {
    const tbody = document.querySelector('#standingsTable tbody');
    const summary = document.getElementById('standingsSummary');
    if (!app.game) {
      tbody.innerHTML = '';
      document.getElementById('standingsEmpty').style.display = 'block';
      summary.innerHTML = '';
      return;
    }
    document.getElementById('standingsEmpty').style.display = 'none';
    const players = [...app.game.players];
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      status: (a, b) => (b.alive - a.alive) || (b.dayDied || 0) - (a.dayDied || 0),
      kills: (a, b) => b.kills - a.kills,
      location: (a, b) => HG.LOC_MAP[a.location].name.localeCompare(HG.LOC_MAP[b.location].name),
      team: (a, b) => String(a.teamId).localeCompare(String(b.teamId)),
      default: (a, b) => (b.alive - a.alive) || b.kills - a.kills || a.name.localeCompare(b.name),
    };
    players.sort((a, b) => (cmp[app.sortKey] || cmp.default)(a, b) * app.sortDir);

    tbody.innerHTML = players.map(p => {
      const team = p.teamId ? HG.getTeam(app.game, p.teamId) : null;
      return `<tr data-id="${p.id}">
        <td><img class="mini-avatar" src="${avatarSrc(p)}">${esc(p.name)}</td>
        <td>${p.alive ? '<span class="status-pill alive">ALIVE</span>' : `<span class="status-pill dead">Day ${p.dayDied} · ${esc(p.causeOfDeath || 'deceased')}</span>`}</td>
        <td>${p.kills}</td>
        <td>${p.alive ? esc(HG.LOC_MAP[p.location].name) : '—'}</td>
        <td>${team ? esc(team.name) : '—'}</td>
        <td>${p.traits.map(traitChip).join('')}</td>
      </tr>`;
    }).join('');

    const alive = players.filter(p => p.alive).length;
    const kills = players.reduce((s, p) => s + p.kills, 0);
    summary.innerHTML = app.game.ended
      ? `<div class="card"><h2>Final Summary</h2><p>${esc(HG.phaseLabel(app.game))} · ${kills} total kill${kills === 1 ? '' : 's'} · ${app.game.players.length} tributes entered.</p></div>`
      : `<div class="card"><h2>Live Summary <small>updates as the games play out</small></h2><p>${alive} of ${players.length} tributes remaining · ${kills} kill${kills === 1 ? '' : 's'} so far · currently ${esc(HG.phaseLabel(app.game))}.</p></div>`;
  }
  document.querySelector('#standingsTable tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    openPlayerModal(tr.dataset.id);
  });

  // -------------------------------------------------------------------------
  // MODAL
  // -------------------------------------------------------------------------
  function openPlayerModal(id) {
    const p = HG.getPlayer(app.game, id);
    if (!p) return;
    const team = p.teamId ? HG.getTeam(app.game, p.teamId) : null;
    const mates = team ? team.memberIds.filter(m => m !== p.id).map(m => HG.getPlayer(app.game, m)) : [];
    const myLog = app.game.log.filter(l => l.actors.includes(p.id));

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
      <div><b>Traits</b><div style="margin-top:6px;">${p.traits.map(traitChip).join('') || '—'}</div></div>
      <div class="hr"></div>
      <div><b>Location</b> — ${p.alive ? esc(HG.LOC_MAP[p.location].name) : '—'} &nbsp;·&nbsp; <b>Kills</b> — ${p.kills}</div>
      <div class="hr"></div>
      <div><b>Alliance</b> — ${team ? esc(team.name) : 'None'}${mates.length ? ' with ' + mates.map(m => esc(m.name)).join(', ') : ''}</div>
      <div><b>Inventory</b>
        <div class="inv-list">${p.inventory.length ? p.inventory.map(i => `<span class="inv-chip ${i.hidden ? 'hidden-item' : ''}" title="${i.hidden ? 'Kept secret from allies' : ''}">${esc(i.name)}${i.hidden ? ' 🔒' : ''}</span>`).join('') : '<span class="inv-chip">Empty-handed</span>'}</div>
      </div>
      <div class="hr"></div>
      <div><b>Personal Log</b>
        <div class="mini-log">${myLog.slice().reverse().map(l => `<div class="feed-entry type-${l.type}"><span class="tag">${TYPE_ICON[l.type] || '•'}</span>${esc(l.text)}</div>`).join('') || '<div class="hint">Nothing notable yet.</div>'}</div>
      </div>
    `;
    document.getElementById('modalBackdrop').classList.add('open');
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
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
  function closeModal() { document.getElementById('modalBackdrop').classList.remove('open'); }
  document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // -------------------------------------------------------------------------
  // INIT
  // -------------------------------------------------------------------------
  renderRoster();
  updateMeta();
  initPortraitSource();

  window.__app = app; // exposed for debugging/testing only
})();
