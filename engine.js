// ============================================================================
// SIMULATION ENGINE
// Pure state-transition logic. No DOM access — works in Node (for testing)
// and in the browser when concatenated into the page script.
// ============================================================================

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const D = require('./data.js');
    module.exports = factory(D);
  } else {
    root.HGEngine = factory(root.HGData);
  }
}(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this), function (D) {
  const { LOCATIONS, ITEMS, TRAITS, pick, pickWeighted, randInt, randomItem, randomTraits } = D;

  const TRAIT_MAP = Object.fromEntries(TRAITS.map(t => [t.id, t]));
  const LOC_MAP = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function newId() { return Math.random().toString(36).slice(2, 10); }

  // -------------------------------------------------------------------------
  // Player / game creation
  // -------------------------------------------------------------------------
  function createPlayer(name, avatarSeed, opts) {
    opts = opts || {};
    return {
      id: newId(),
      name,
      avatarSeed: avatarSeed || name,
      pictureData: opts.pictureData || null, // optional user-uploaded dataURL
      alive: true,
      dayDied: null,
      causeOfDeath: null,
      killedBy: null,
      health: 100, hunger: 100, thirst: 100, sanity: 100,
      location: 'cornucopia',
      inventory: [],
      traits: opts.traits || randomTraits(2),
      kills: 0,
      teamId: null,
      statusEffects: [],
      appeal: randInt(0, 5),
      placement: null, // filled in when they die/win (rank)
    };
  }

  function createGame(roster, settings) {
    settings = Object.assign({ teamVictory: false, arenaEventChance: 0.30, twistChance: 0.10 }, settings || {});
    const players = roster.map(r => createPlayer(r.name, r.avatarSeed, r));
    return {
      players,
      teams: [],
      day: 1,
      phaseType: 'bloodbath', // bloodbath | day | night
      phaseIndex: 0,
      log: [],
      ended: false,
      winner: null, // {type:'player'|'team', id}
      locationStatus: {}, // locId -> {tag, turnsLeft}
      globalStatus: [], // {id, turnsLeft, mods:{}}
      feastPending: null, // phaseIndex when feast resolves
      twistsUsed: 0,
      lastTwistPhase: -99,
      settings,
      deathOrder: [],
    };
  }

  function phaseLabel(state) {
    if (state.phaseType === 'bloodbath') return `Day ${state.day} — The Bloodbath`;
    if (state.phaseType === 'day') return `Day ${state.day}`;
    return `Night ${state.day}`;
  }

  function pushLog(state, text, opts) {
    opts = opts || {};
    state.log.push({
      day: state.day,
      phase: state.phaseType,
      phaseIndex: state.phaseIndex,
      text,
      type: opts.type || 'flavor',
      actors: opts.actors || [],
    });
  }

  function alivePlayers(state) { return state.players.filter(p => p.alive); }
  function getPlayer(state, id) { return state.players.find(p => p.id === id); }
  function getTeam(state, id) { return state.teams.find(t => t.id === id); }
  function teammates(state, player) {
    if (!player.teamId) return [];
    const team = getTeam(state, player.teamId);
    if (!team) return [];
    return team.memberIds.filter(id => id !== player.id).map(id => getPlayer(state, id)).filter(p => p && p.alive);
  }

  // -------------------------------------------------------------------------
  // Trait / status modifiers
  // -------------------------------------------------------------------------
  function getMod(player, key) {
    let total = 0;
    for (const tid of player.traits) {
      const t = TRAIT_MAP[tid];
      if (t && t.mods && t.mods[key]) total += t.mods[key];
    }
    for (const s of player.statusEffects) {
      if (s.mods && s.mods[key]) total += s.mods[key];
    }
    return total;
  }
  function hasTrait(player, id) { return player.traits.includes(id); }
  function hasStatus(player, id) { return player.statusEffects.some(s => s.id === id); }
  function addStatus(player, id, turns, mods, label) {
    player.statusEffects = player.statusEffects.filter(s => s.id !== id);
    player.statusEffects.push({ id, turnsLeft: turns, mods: mods || {}, label: label || id });
  }

  function weaponIn(inventory) {
    const weapons = inventory.filter(i => i.category === 'weapon');
    if (!weapons.length) return null;
    return weapons.reduce((a, b) => (b.power > a.power ? b : a));
  }

  function combatScore(player, allyCount) {
    const w = weaponIn(player.inventory);
    let score = 8 + (w ? w.power : 0) + getMod(player, 'combat') + getMod(player, 'ambush') * 0.5;
    score += (allyCount || 0) * 2.5;
    score += randInt(0, 8);
    if (player.health < 40) score -= 3;
    if (player.hunger < 20 || player.thirst < 20) score -= 2;
    return score;
  }

  // -------------------------------------------------------------------------
  // Item / inventory helpers
  // -------------------------------------------------------------------------
  function giveItem(player, item) { player.inventory.push(item); }
  function removeItem(player, itemId) {
    const idx = player.inventory.findIndex(i => i.id === itemId);
    if (idx >= 0) return player.inventory.splice(idx, 1)[0];
    return null;
  }
  function bestFood(inv) { return inv.filter(i => i.category === 'food').sort((a, b) => b.restore - a.restore)[0]; }
  function bestWater(inv) { return inv.filter(i => i.category === 'water').sort((a, b) => b.restore - a.restore)[0]; }
  function bestMedicine(inv) { return inv.filter(i => i.category === 'medicine').sort((a, b) => b.heal - a.heal)[0]; }

  function sharedInventory(state, team) {
    let items = [];
    for (const mid of team.memberIds) {
      const p = getPlayer(state, mid);
      if (p && p.alive) items = items.concat(p.inventory.filter(i => !i.hidden));
    }
    return items;
  }

  // -------------------------------------------------------------------------
  // Needs decay & auto-consumption
  // -------------------------------------------------------------------------
  function tickNeeds(state, player) {
    const isNight = state.phaseType === 'night';
    let hungerDecay = randInt(6, 10) + getMod(player, 'needDecay');
    let thirstDecay = randInt(9, 14) + getMod(player, 'needDecay');
    let sanityDecay = (isNight ? randInt(4, 9) : randInt(1, 5)) + getMod(player, 'sanityDecay');

    const loc = LOC_MAP[player.location];
    if (loc.tags.includes('shelter')) sanityDecay -= 2;
    if (loc.tags.includes('exposed') && isNight) sanityDecay += 2;
    if (teammates(state, player).length > 0) sanityDecay -= 2;

    player.hunger = clamp(player.hunger - Math.max(1, hungerDecay), 0, 100);
    player.thirst = clamp(player.thirst - Math.max(1, thirstDecay), 0, 100);
    player.sanity = clamp(player.sanity - Math.max(0, sanityDecay), 0, 100);

    let healthDelta = 0;
    if (player.hunger <= 0) healthDelta -= 5;
    if (player.thirst <= 0) healthDelta -= 8;
    if (player.sanity <= 0 && Math.random() < 0.15) {
      // breakdown: erratic self-endangering behaviour
      healthDelta -= 4;
      pushLog(state, `${player.name} is unraveling, mind fraying under the pressure of the arena.`, { type: 'flavor', actors: [player.id] });
    }
    player.health = clamp(player.health + healthDelta, 0, 100);
  }

  function autoConsume(state, player) {
    if (player.hunger < 45) {
      const f = bestFood(player.inventory);
      if (f) {
        removeItem(player, f.id);
        player.hunger = clamp(player.hunger + f.restore, 0, 100);
        pushLog(state, `${player.name} eats ${f.name.toLowerCase()}.`, { type: 'item', actors: [player.id] });
      }
    }
    if (player.thirst < 45) {
      const w = bestWater(player.inventory);
      if (w) {
        removeItem(player, w.id);
        player.thirst = clamp(player.thirst + w.restore, 0, 100);
        pushLog(state, `${player.name} drinks from ${w.name.toLowerCase()}.`, { type: 'item', actors: [player.id] });
      }
    }
    if (player.health < 55) {
      const m = bestMedicine(player.inventory);
      if (m && Math.random() < 0.7) {
        removeItem(player, m.id);
        player.health = clamp(player.health + m.heal + getMod(player, 'healing'), 0, 100);
        if (m.sanity) player.sanity = clamp(player.sanity + m.sanity, 0, 100);
        pushLog(state, `${player.name} uses ${m.name.toLowerCase()} to patch up.`, { type: 'item', actors: [player.id] });
      }
    }
  }

  function tickStatusEffects(state, player) {
    let hazardHit = false;
    for (const s of player.statusEffects) {
      if (s.id === 'wounded' || s.id === 'feverish' || s.id === 'poisoned') {
        player.health = clamp(player.health - 3, 0, 100);
        hazardHit = true;
      }
    }
    player.statusEffects = player.statusEffects.filter(s => --s.turnsLeft > -1 ? true : false);
    player.statusEffects = player.statusEffects.filter(s => s.turnsLeft >= 0);
    return hazardHit;
  }

  // -------------------------------------------------------------------------
  // Death
  // -------------------------------------------------------------------------
  function killPlayer(state, player, cause, killerId) {
    if (!player.alive) return;
    player.alive = false;
    player.dayDied = state.day;
    player.causeOfDeath = cause;
    player.killedBy = killerId || null;
    player.placement = alivePlayers(state).length + 1; // before this death resolves fully caller should count remaining
    state.deathOrder.push(player.id);
    if (player.teamId) {
      const team = getTeam(state, player.teamId);
      if (team) {
        team.memberIds = team.memberIds.filter(id => id !== player.id);
        if (team.memberIds.length <= 1) dissolveTeam(state, team.id);
      }
    }
  }

  function dissolveTeam(state, teamId) {
    const team = getTeam(state, teamId);
    if (!team) return;
    for (const mid of team.memberIds) {
      const p = getPlayer(state, mid);
      if (p) p.teamId = null;
    }
    state.teams = state.teams.filter(t => t.id !== teamId);
  }

  // -------------------------------------------------------------------------
  // Alliances
  // -------------------------------------------------------------------------
  function allianceName(a, b) {
    return `The ${pick(D.ALLIANCE_ADJ)} ${pick(D.ALLIANCE_NOUN)}`;
  }

  function formAlliance(state, playerA, playerB) {
    let team;
    if (playerA.teamId) team = getTeam(state, playerA.teamId);
    else if (playerB.teamId) team = getTeam(state, playerB.teamId);

    if (!team) {
      team = { id: newId(), name: allianceName(playerA, playerB), memberIds: [], formedDay: state.day };
      state.teams.push(team);
    }
    for (const p of [playerA, playerB]) {
      if (!team.memberIds.includes(p.id)) team.memberIds.push(p.id);
      p.teamId = team.id;
      // decide what, if anything, they keep secret from the new team
      for (const item of p.inventory) {
        if (item.category === 'weapon' && Math.random() < 0.2) item.hidden = true;
        else if (Math.random() < 0.12) item.hidden = true;
      }
    }
    return team;
  }

  function allianceEligible(state, a, b) {
    if (a.teamId && b.teamId && a.teamId === b.teamId) return false;
    // rival teams merging is allowed but rarer; handled by caller weighting
    return true;
  }

  // -------------------------------------------------------------------------
  // Combat resolution between two "champions" representing clusters
  // -------------------------------------------------------------------------
  function resolveCombat(state, attacker, defender, attackerAllies, defenderAllies, opts) {
    opts = opts || {};
    const atkScore = combatScore(attacker, attackerAllies) + (opts.ambush ? getMod(attacker, 'ambush') : 0);
    const defScore = combatScore(defender, defenderAllies) + getMod(defender, 'flee') * 0.6;
    const margin = atkScore - defScore;

    attacker.hunger = clamp(attacker.hunger - randInt(2, 5), 0, 100);
    attacker.thirst = clamp(attacker.thirst - randInt(2, 5), 0, 100);

    let outcome;
    if (margin >= 6) outcome = 'decisive_attacker';
    else if (margin >= -3) outcome = Math.random() < 0.5 + margin * 0.03 ? 'narrow_attacker' : 'narrow_defender';
    else outcome = 'decisive_defender';

    const loser = (outcome === 'decisive_attacker' || outcome === 'narrow_attacker') ? defender : attacker;
    const winner = loser === defender ? attacker : defender;
    const decisive = outcome.startsWith('decisive');

    let deathChance = decisive ? 0.62 : 0.22;
    deathChance += getMod(loser, 'injury') * 0.02;
    deathChance -= getMod(loser, 'luck') * 0.02;
    deathChance = clamp(deathChance, 0.05, 0.92);

    let resultText;
    if (Math.random() < deathChance) {
      // loot before death removes items
      const loot = loser.inventory.filter(i => !i.hidden);
      if (loot.length) {
        const taken = loot[randInt(0, loot.length - 1)];
        removeItem(loser, taken.id);
        giveItem(winner, taken);
      }
      killPlayer(state, loser, winner === attacker ? 'killed in combat' : 'killed in combat', winner.id);
      winner.kills += 1;
      winner.appeal += 6;
      resultText = `${winner.name} kills ${loser.name}${opts.ambush ? ' in a sudden ambush' : ''}.`;
      pushLog(state, resultText, { type: 'death', actors: [winner.id, loser.id] });
    } else {
      loser.health = clamp(loser.health - randInt(15, 30), 0, 100);
      addStatus(loser, 'wounded', randInt(2, 4), { combat: -3, flee: -1 }, 'Wounded');
      winner.appeal += 2;
      resultText = `${winner.name} and ${loser.name} fight — ${loser.name} is badly wounded and manages to break away.`;
      pushLog(state, resultText, { type: 'combat', actors: [winner.id, loser.id] });
    }
    return { winner, loser, outcome };
  }

  // -------------------------------------------------------------------------
  // Solo actions
  // -------------------------------------------------------------------------
  function locationScavengeWeights(loc) {
    const w = { weapon: 1, tool: 2, food: 2, water: 1, medicine: 1 };
    if (loc.tags.includes('food')) w.food += 3;
    if (loc.tags.includes('water')) w.water += 4;
    if (loc.tags.includes('cover')) w.tool += 2;
    if (loc.tags.includes('hub')) { w.weapon += 3; w.tool += 1; }
    if (loc.tags.includes('shelter')) w.medicine += 1;
    return w;
  }

  function doScavenge(state, player) {
    const loc = LOC_MAP[player.location];
    let chance = 0.55 + getMod(player, 'scavenge') * 0.04 + getMod(player, 'luck') * 0.02;
    chance = clamp(chance, 0.1, 0.92);
    if (Math.random() < chance) {
      const w = locationScavengeWeights(loc);
      const category = pickWeighted(Object.entries(w).map(([k, v]) => ({ item: k, weight: v })));
      const item = randomItem(category);
      giveItem(player, item);
      const verbs = {
        weapon: 'finds a weapon lying half-buried',
        tool: 'scavenges a useful bit of gear',
        food: 'forages something edible',
        water: 'tracks down a water source',
        medicine: 'digs up medical supplies',
      };
      pushLog(state, `${player.name} ${verbs[category]}: ${item.name}.`, { type: 'item', actors: [player.id] });
    } else {
      if (loc.tags.includes('dangerous') && Math.random() < 0.18 + getMod(player, 'injury') * 0.02) {
        player.health = clamp(player.health - randInt(5, 14), 0, 100);
        pushLog(state, `${player.name} searches ${loc.name} and stumbles into a hidden hazard.`, { type: 'injury', actors: [player.id] });
      } else {
        pushLog(state, `${player.name} searches ${loc.name} and comes up empty-handed.`, { type: 'flavor', actors: [player.id] });
      }
    }
  }

  function doHuntAnimal(state, player) {
    const loc = LOC_MAP[player.location];
    let chance = 0.45 + getMod(player, 'hunt') * 0.05 + getMod(player, 'combat') * 0.02;
    chance = clamp(chance, 0.1, 0.9);
    if (Math.random() < chance) {
      const item = randomItem('food');
      item.restore += 6;
      giveItem(player, item);
      pushLog(state, `${player.name} tracks and takes down game, coming away with ${item.name.toLowerCase()}.`, { type: 'item', actors: [player.id] });
    } else if (loc.tags.includes('dangerous') && Math.random() < 0.25) {
      player.health = clamp(player.health - randInt(8, 20), 0, 100);
      addStatus(player, 'wounded', 2, { combat: -2 }, 'Wounded');
      pushLog(state, `${player.name} is mauled while hunting and barely escapes.`, { type: 'injury', actors: [player.id] });
    } else {
      pushLog(state, `${player.name} finds tracks but the animal gets away.`, { type: 'flavor', actors: [player.id] });
    }
  }

  function doRest(state, player) {
    const loc = LOC_MAP[player.location];
    const bonus = loc.tags.includes('shelter') ? 1.5 : 1;
    player.health = clamp(player.health + Math.round(randInt(4, 9) * bonus) + getMod(player, 'healthRegen'), 0, 100);
    player.sanity = clamp(player.sanity + Math.round(randInt(3, 7) * bonus), 0, 100);
    pushLog(state, `${player.name} rests at ${loc.name}, catching their breath.`, { type: 'flavor', actors: [player.id] });
  }

  function doHide(state, player) {
    addStatus(player, 'hidden', 1, { stealth: 5 }, 'Hidden');
    player.sanity = clamp(player.sanity + randInt(1, 4), 0, 100);
    pushLog(state, `${player.name} melts into cover, staying out of sight.`, { type: 'flavor', actors: [player.id] });
  }

  function doMove(state, player, awayFromThreat) {
    const loc = LOC_MAP[player.location];
    let options = loc.connections.filter(id => !(state.locationStatus[id] && state.locationStatus[id].tag === 'collapsed'));
    if (!options.length) options = loc.connections;
    if (state.feastPending === state.phaseIndex + 1 && Math.random() < 0.5 && options.includes('cornucopia')) {
      player.location = 'cornucopia';
    } else {
      player.location = pick(options.length ? options : ['cornucopia']);
    }
    const verb = awayFromThreat ? 'flees toward' : 'moves on toward';
    pushLog(state, `${player.name} ${verb} ${LOC_MAP[player.location].name}.`, { type: 'flavor', actors: [player.id] });
  }

  function soloAction(state, player) {
    const loc = LOC_MAP[player.location];
    const weights = [];
    weights.push({ item: 'scavenge', weight: 30 + (player.hunger < 40 || player.thirst < 40 ? 15 : 0) + getMod(player, 'scavenge') * 2 });
    weights.push({ item: 'hunt', weight: (loc.tags.includes('forest') || loc.tags.includes('water') || loc.tags.includes('food')) ? 16 : 6 });
    weights.push({ item: 'move', weight: 20 + getMod(player, 'flee') });
    weights.push({ item: 'rest', weight: 14 + (player.health < 50 ? 16 : 0) + (player.sanity < 40 ? 10 : 0) });
    weights.push({ item: 'hide', weight: (loc.tags.includes('cover') || loc.tags.includes('dark') ? 14 : 6) + getMod(player, 'stealth') });
    const action = pickWeighted(weights);
    if (action === 'scavenge') doScavenge(state, player);
    else if (action === 'hunt') doHuntAnimal(state, player);
    else if (action === 'move') doMove(state, player, false);
    else if (action === 'rest') doRest(state, player);
    else doHide(state, player);
  }

  // -------------------------------------------------------------------------
  // Team internal logic: sharing reminder + betrayal checks
  // -------------------------------------------------------------------------
  function teamUpkeep(state, team) {
    const members = team.memberIds.map(id => getPlayer(state, id)).filter(p => p && p.alive);
    if (members.length < 2) { if (members.length <= 1) dissolveTeam(state, team.id); return; }

    const remaining = alivePlayers(state).length;
    const shared = sharedInventory(state, team);
    const scarcity = shared.filter(i => i.category === 'food').length === 0 || shared.filter(i => i.category === 'water').length === 0;

    for (const member of members) {
      if (!member.alive || member.teamId !== team.id) continue;
      let betrayChance = 0.02 + state.day * 0.006 + getMod(member, 'betrayal') * 0.012;
      if (scarcity) betrayChance += 0.05;
      if (remaining <= 6) betrayChance += 0.05;
      if (remaining <= 3) betrayChance += 0.08;
      if (member.sanity < 25) betrayChance += 0.05;
      betrayChance = clamp(betrayChance, 0, 0.45);

      if (Math.random() < betrayChance) {
        const targets = members.filter(m => m.id !== member.id && m.alive);
        if (!targets.length) continue;
        const victim = pick(targets);
        pushLog(state, `${member.name} turns on ${victim.name} in the dead of night, shattering the alliance.`, { type: 'betrayal', actors: [member.id, victim.id] });
        const { } = resolveCombat(state, member, victim, 0, 0, { ambush: true });
        member.teamId = null;
        team.memberIds = team.memberIds.filter(id => id !== member.id);
        if (team.memberIds.length <= 1) dissolveTeam(state, team.id);
        return; // one betrayal per team per phase keeps things legible
      }
    }
  }

  // -------------------------------------------------------------------------
  // Location interaction resolution
  // -------------------------------------------------------------------------
  function clustersAt(state, players) {
    // returns array of {teamId|null, members:[]}
    const byTeam = new Map();
    const solos = [];
    for (const p of players) {
      if (p.teamId) {
        if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
        byTeam.get(p.teamId).push(p);
      } else solos.push(p);
    }
    const clusters = [...byTeam.entries()].map(([teamId, members]) => ({ teamId, members }));
    for (const s of solos) clusters.push({ teamId: null, members: [s] });
    return clusters;
  }

  function resolveLocationEncounters(state, locationId, players) {
    if (players.length < 2) return;
    const clusters = clustersAt(state, players);
    if (clusters.length < 2) return; // everyone here is already one team

    // Randomize pair order, resolve a handful of pairwise encounters this phase
    const pairs = [];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) pairs.push([clusters[i], clusters[j]]);
    }
    pairs.sort(() => Math.random() - 0.5);
    const maxEncounters = Math.min(pairs.length, 3);
    const involved = new Set();

    for (let k = 0; k < maxEncounters; k++) {
      const [ca, cb] = pairs[k];
      if (ca.members.some(m => involved.has(m.id) && !m.alive)) continue;
      const a = ca.members.filter(m => m.alive);
      const b = cb.members.filter(m => m.alive);
      if (!a.length || !b.length) continue;

      const championA = a.reduce((x, y) => (combatScore(y, a.length - 1) > combatScore(x, a.length - 1) ? y : x));
      const championB = b.reduce((x, y) => (combatScore(y, b.length - 1) > combatScore(x, b.length - 1) ? y : x));

      const weaponA = !!weaponIn(championA.inventory);
      const weaponB = !!weaponIn(championB.inventory);
      const aggression = (weaponA ? 10 : 0) + (weaponB ? 5 : 0) + state.day * 2
        + a.reduce((s, m) => s + getMod(m, 'betrayal') + (hasTrait(m, 'bloodthirsty') ? 8 : 0), 0);

      let conflictChance = 14 + aggression - (a.reduce((s, m) => s + getMod(m, 'alliance'), 0));
      let allianceChance = (ca.teamId === null && cb.teamId === null) ? clamp(38 - state.day * 3, 4, 45) : 6;
      allianceChance += a.reduce((s, m) => s + getMod(m, 'alliance'), 0) + b.reduce((s, m) => s + getMod(m, 'alliance'), 0);
      allianceChance -= a.reduce((s, m) => s + getMod(m, 'betrayal'), 0) + b.reduce((s, m) => s + getMod(m, 'betrayal'), 0);
      allianceChance = clamp(allianceChance, 0, 60);
      conflictChance = clamp(conflictChance, 5, 85);
      const avoidChance = 20;

      const total = conflictChance + allianceChance + avoidChance;
      const roll = Math.random() * total;

      if (roll < conflictChance) {
        const numAdvantageA = a.length - b.length;
        const { winner, loser } = resolveCombat(state, championA, championB, a.length - 1, b.length - 1, {});
        involved.add(championA.id); involved.add(championB.id);
        // outnumbered pile-on: chance a second member of the losing side falls too
        const loserCluster = loser === championA ? a : b;
        const winnerCluster = winner === championA ? a : b;
        if (winnerCluster.length - loserCluster.length >= 2 && loserCluster.length > 1 && Math.random() < 0.3) {
          const extra = loserCluster.find(m => m.id !== loser.id && m.alive);
          if (extra) {
            extra.health = clamp(extra.health - randInt(20, 40), 0, 100);
            if (extra.health <= 0 || Math.random() < 0.35) {
              killPlayer(state, extra, 'overwhelmed in a group fight', winner.id);
              winner.kills += 1;
              pushLog(state, `In the chaos, ${extra.name} is also cut down.`, { type: 'death', actors: [winner.id, extra.id] });
            } else {
              addStatus(extra, 'wounded', 3, { combat: -3 }, 'Wounded');
              pushLog(state, `${extra.name} is caught in the melee and badly hurt.`, { type: 'injury', actors: [extra.id] });
            }
          }
        }
      } else if (roll < conflictChance + allianceChance) {
        formAlliance(state, championA, championB);
        pushLog(state, `${championA.name} and ${championB.name} agree to team up.`, { type: 'alliance', actors: [championA.id, championB.id] });
      } else {
        pushLog(state, `${championA.name}'s group and ${championB.name}'s group cross paths at ${LOC_MAP[locationId].name} and warily keep their distance.`, { type: 'flavor', actors: [championA.id, championB.id] });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sponsors
  // -------------------------------------------------------------------------
  function trySponsor(state, player) {
    if (!player.alive) return;
    let chance = 0.035 + player.appeal * 0.003 + getMod(player, 'sponsor') * 0.01;
    if (state.globalStatus.some(s => s.id === 'gift_surge')) chance += 0.12;
    chance = clamp(chance, 0, 0.5);
    if (Math.random() < chance) {
      const cat = pickWeighted([
        { item: 'medicine', weight: 3 }, { item: 'food', weight: 3 }, { item: 'water', weight: 3 },
        { item: 'tool', weight: 2 }, { item: 'weapon', weight: 1 },
      ]);
      const item = randomItem(cat);
      giveItem(player, item);
      player.appeal = Math.max(0, player.appeal - 3);
      pushLog(state, `A sponsor gift descends by parachute for ${player.name}: ${item.name}.`, { type: 'sponsor', actors: [player.id] });
    } else {
      player.appeal += 0.3;
    }
  }

  // -------------------------------------------------------------------------
  // Arena events & twists
  // -------------------------------------------------------------------------
  const ARENA_EVENTS = [
    {
      id: 'feast', label: 'Feast Announced',
      eligible: (s) => s.feastPending === null && s.day >= 2,
      apply: (s) => {
        s.feastPending = s.phaseIndex + 1;
        pushLog(s, `The anthem sounds — a feast is announced at the Cornucopia. Supplies will be waiting for anyone bold enough to come.`, { type: 'arena' });
      },
    },
    {
      id: 'feast_resolve', label: 'Feast',
      eligible: (s) => s.feastPending === s.phaseIndex,
      apply: (s) => {
        s.feastPending = null;
        const here = alivePlayers(s).filter(p => p.location === 'cornucopia');
        for (const p of here) {
          if (Math.random() < 0.7) {
            const cat = pickWeighted([{ item: 'weapon', weight: 2 }, { item: 'medicine', weight: 3 }, { item: 'food', weight: 2 }, { item: 'water', weight: 2 }]);
            giveItem(p, randomItem(cat));
          }
        }
        pushLog(s, `The feast unfolds at the Cornucopia. ${here.length} tribute${here.length === 1 ? '' : 's'} show${here.length === 1 ? 's' : ''} up to fight over the supplies.`, { type: 'arena' });
        resolveLocationEncounters(s, 'cornucopia', here);
      },
    },
    {
      id: 'wildfire', label: 'Wildfire',
      eligible: (s) => LOCATIONS.some(l => l.tags.includes('forest') && !s.locationStatus[l.id]),
      apply: (s) => {
        const opts = LOCATIONS.filter(l => l.tags.includes('forest') && !s.locationStatus[l.id]);
        const loc = pick(opts);
        s.locationStatus[loc.id] = { tag: 'wildfire', turnsLeft: 2 };
        pushLog(s, `Wildfire rips through ${loc.name}! Anyone still there will be burned.`, { type: 'arena' });
        for (const p of alivePlayers(s).filter(p => p.location === loc.id)) {
          p.health = clamp(p.health - randInt(15, 30), 0, 100);
          pushLog(s, `${p.name} is caught in the flames at ${loc.name}.`, { type: 'injury', actors: [p.id] });
        }
      },
    },
    {
      id: 'flood', label: 'Flash Flood',
      eligible: (s) => LOCATIONS.some(l => l.tags.includes('water') && !s.locationStatus[l.id]),
      apply: (s) => {
        const opts = LOCATIONS.filter(l => l.tags.includes('water') && !s.locationStatus[l.id]);
        const loc = pick(opts);
        s.locationStatus[loc.id] = { tag: 'flood', turnsLeft: 2 };
        pushLog(s, `A flash flood sweeps through ${loc.name}, dragging supplies away with it.`, { type: 'arena' });
        for (const p of alivePlayers(s).filter(p => p.location === loc.id)) {
          p.health = clamp(p.health - randInt(8, 18), 0, 100);
          if (p.inventory.length && Math.random() < 0.5) {
            const lost = p.inventory[randInt(0, p.inventory.length - 1)];
            removeItem(p, lost.id);
            pushLog(s, `${p.name} loses ${lost.name.toLowerCase()} to the floodwaters.`, { type: 'flavor', actors: [p.id] });
          }
        }
      },
    },
    {
      id: 'mutts', label: 'Muttation Attack',
      eligible: (s) => alivePlayers(s).length > 2,
      apply: (s) => {
        const populated = {};
        for (const p of alivePlayers(s)) (populated[p.location] = populated[p.location] || []).push(p);
        const candidates = Object.keys(populated).filter(id => id !== 'cornucopia' || Math.random() < 0.3);
        if (!candidates.length) return;
        const locId = pick(candidates);
        const loc = LOC_MAP[locId];
        pushLog(s, `Genetically engineered mutts swarm out of ${loc.name}!`, { type: 'arena' });
        for (const p of populated[locId]) {
          if (Math.random() < 0.5 + getMod(p, 'luck') * -0.02) {
            const dmg = randInt(20, 45);
            p.health = clamp(p.health - dmg, 0, 100);
            if (p.health <= 0 || Math.random() < 0.25) {
              killPlayer(s, p, 'killed by muttations', null);
              pushLog(s, `${p.name} doesn't escape the mutts in time.`, { type: 'death', actors: [p.id] });
            } else {
              addStatus(p, 'wounded', 2, { combat: -2 }, 'Wounded');
              pushLog(s, `${p.name} is mauled but breaks free of the mutts.`, { type: 'injury', actors: [p.id] });
            }
          } else {
            pushLog(s, `${p.name} narrowly escapes the mutts.`, { type: 'flavor', actors: [p.id] });
          }
        }
      },
    },
    {
      id: 'fog', label: 'Toxic Fog',
      eligible: () => true,
      apply: (s) => {
        const loc = pick(LOCATIONS.filter(l => l.id !== 'cornucopia'));
        s.locationStatus[loc.id] = { tag: 'fog', turnsLeft: 2 };
        pushLog(s, `A poisonous fog rolls over ${loc.name}, thick and choking.`, { type: 'arena' });
        for (const p of alivePlayers(s).filter(p => p.location === loc.id)) {
          p.health = clamp(p.health - randInt(6, 14), 0, 100);
          p.sanity = clamp(p.sanity - randInt(5, 12), 0, 100);
        }
      },
    },
    {
      id: 'giftsurge', label: 'Generous Crowd',
      eligible: () => true,
      apply: (s) => {
        s.globalStatus.push({ id: 'gift_surge', turnsLeft: 1 });
        pushLog(s, `The crowds back home are captivated tonight — sponsor gifts are pouring in.`, { type: 'arena' });
      },
    },
    {
      id: 'shrink', label: 'Gamemaker Shrink',
      eligible: (s) => LOCATIONS.filter(l => l.id !== 'cornucopia' && !s.locationStatus[l.id]).length > 4,
      apply: (s) => {
        const opts = LOCATIONS.filter(l => l.id !== 'cornucopia' && !s.locationStatus[l.id]);
        const loc = pick(opts);
        s.locationStatus[loc.id] = { tag: 'collapsed', turnsLeft: 9999 };
        pushLog(s, `The gamemakers seal off ${loc.name} — the arena is shrinking, forcing everyone closer together.`, { type: 'arena' });
        for (const p of alivePlayers(s).filter(p => p.location === loc.id)) {
          p.location = pick(loc.connections);
          pushLog(s, `${p.name} is forced out of ${loc.name} toward ${LOC_MAP[p.location].name}.`, { type: 'flavor', actors: [p.id] });
        }
      },
    },
  ];

  const TWISTS = [
    {
      id: 'forced_duel', label: 'Forced Duel',
      eligible: (s) => alivePlayers(s).length >= 2,
      apply: (s) => {
        const pool = alivePlayers(s);
        const a = pick(pool);
        const b = pick(pool.filter(p => p.id !== a.id));
        a.location = 'cornucopia'; b.location = 'cornucopia';
        pushLog(s, `TWIST: The gamemakers force ${a.name} and ${b.name} into the open — only one may walk away.`, { type: 'twist', actors: [a.id, b.id] });
        resolveCombat(s, a, b, 0, 0, {});
      },
    },
    {
      id: 'forced_alliance', label: 'Forced Alliance',
      eligible: (s) => alivePlayers(s).length >= 2,
      apply: (s) => {
        const pool = alivePlayers(s).filter(p => !p.teamId);
        if (pool.length < 2) return;
        const a = pick(pool);
        const b = pick(pool.filter(p => p.id !== a.id));
        formAlliance(s, a, b);
        pushLog(s, `TWIST: The gamemakers announce a one-time rule change — ${a.name} and ${b.name} must cooperate to survive the next day.`, { type: 'twist', actors: [a.id, b.id] });
      },
    },
    {
      id: 'weapon_drop', label: 'Weapons Rain Down',
      eligible: () => true,
      apply: (s) => {
        pushLog(s, `TWIST: Silver parachutes fill the sky — every tribute still standing receives a weapon.`, { type: 'twist' });
        for (const p of alivePlayers(s)) giveItem(p, randomItem('weapon'));
      },
    },
    {
      id: 'mercy', label: "Gamemakers' Mercy",
      eligible: () => true,
      apply: (s) => {
        pushLog(s, `TWIST: In a rare show of mercy, the gamemakers restore all surviving tributes.`, { type: 'twist' });
        for (const p of alivePlayers(s)) {
          p.health = clamp(p.health + 35, 0, 100);
          p.hunger = clamp(p.hunger + 35, 0, 100);
          p.thirst = clamp(p.thirst + 35, 0, 100);
          p.sanity = clamp(p.sanity + 25, 0, 100);
        }
      },
    },
    {
      id: 'long_night', label: 'The Long Night',
      eligible: (s) => s.phaseType !== 'day',
      apply: (s) => {
        s.globalStatus.push({ id: 'long_night', turnsLeft: 1 });
        pushLog(s, `TWIST: The sky refuses to lighten. This night will not end quickly.`, { type: 'twist' });
        for (const p of alivePlayers(s)) p.sanity = clamp(p.sanity - randInt(5, 15), 0, 100);
      },
    },
    {
      id: 'plague', label: 'Plague',
      eligible: (s) => alivePlayers(s).length >= 3,
      apply: (s) => {
        const pool = alivePlayers(s);
        const count = Math.max(1, Math.round(pool.length * 0.3));
        const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
        pushLog(s, `TWIST: A sickness sweeps through the arena's water supply.`, { type: 'twist' });
        for (const p of chosen) {
          addStatus(p, 'feverish', 3, { combat: -3, healthRegen: -3 }, 'Feverish');
          pushLog(s, `${p.name} falls ill, feverish and weak.`, { type: 'flavor', actors: [p.id] });
        }
      },
    },
    {
      id: 'bloodlust', label: 'Bloodlust Surge',
      eligible: () => true,
      apply: (s) => {
        s.globalStatus.push({ id: 'bloodlust', turnsLeft: 2 });
        pushLog(s, `TWIST: A warning cannon fires for no one — tensions across the arena spike.`, { type: 'twist' });
      },
    },
  ];

  function maybeArenaEvent(state) {
    const eligible = ARENA_EVENTS.filter(e => e.eligible(state));
    if (!eligible.length) return;
    let chance = state.settings.arenaEventChance + state.day * 0.01;
    if (state.feastPending === state.phaseIndex) chance = 1; // always resolve pending feast
    if (Math.random() < chance) {
      const ev = state.feastPending === state.phaseIndex
        ? ARENA_EVENTS.find(e => e.id === 'feast_resolve')
        : pick(eligible.filter(e => e.id !== 'feast_resolve'));
      if (ev) ev.apply(state);
    }
  }

  function maybeTwist(state) {
    if (state.twistsUsed >= 5) return;
    if (state.phaseIndex - state.lastTwistPhase < 3) return;
    const eligible = TWISTS.filter(t => t.eligible(state));
    if (!eligible.length) return;
    const chance = state.settings.twistChance + state.day * 0.015;
    if (Math.random() < chance) {
      const t = pick(eligible);
      t.apply(state);
      state.twistsUsed++;
      state.lastTwistPhase = state.phaseIndex;
    }
  }

  // -------------------------------------------------------------------------
  // Bloodbath (Day 1 special phase)
  // -------------------------------------------------------------------------
  function runBloodbath(state) {
    const players = alivePlayers(state);
    pushLog(state, `The gong sounds. ${players.length} tributes scramble for the Cornucopia.`, { type: 'arena' });
    const stayers = [];
    for (const p of players) {
      const boldness = 0.5 + getMod(p, 'combat') * 0.03 + getMod(p, 'luck') * 0.02 - getMod(p, 'flee') * 0.03 - (hasTrait(p, 'cowardly') ? 0.15 : 0);
      if (Math.random() < clamp(boldness, 0.15, 0.85)) {
        stayers.push(p);
        if (Math.random() < 0.7) {
          const item = randomItem(pickWeighted([{ item: 'weapon', weight: 3 }, { item: 'tool', weight: 2 }, { item: 'food', weight: 2 }, { item: 'water', weight: 2 }, { item: 'medicine', weight: 1 }]));
          giveItem(p, item);
          pushLog(state, `${p.name} grabs ${item.name.toLowerCase()} from the Cornucopia.`, { type: 'item', actors: [p.id] });
        }
      } else {
        p.location = pick(LOC_MAP.cornucopia.connections);
        pushLog(state, `${p.name} runs straight for the tree line, avoiding the Cornucopia entirely.`, { type: 'flavor', actors: [p.id] });
      }
    }
    resolveLocationEncounters(state, 'cornucopia', stayers);
    // extra chaotic bloodbath skirmishes for aggressive stayers
    const alive = stayers.filter(p => p.alive);
    if (alive.length >= 2) {
      const aggressive = alive.filter(p => hasTrait(p, 'bloodthirsty') || hasTrait(p, 'reckless') || weaponIn(p.inventory));
      for (const att of aggressive) {
        if (!att.alive) continue;
        if (Math.random() < 0.25) {
          const targets = alive.filter(p => p.id !== att.id && p.alive && p.teamId !== att.teamId);
          if (!targets.length) continue;
          const vic = pick(targets);
          resolveCombat(state, att, vic, 0, 0, {});
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase advancement
  // -------------------------------------------------------------------------
  function nextPhaseType(state) {
    if (state.phaseType === 'bloodbath') return { day: state.day, type: 'night' };
    if (state.phaseType === 'night') return { day: state.day + 1, type: 'day' };
    return { day: state.day, type: 'night' };
  }

  function checkWin(state) {
    const alive = alivePlayers(state);
    if (alive.length === 1) {
      state.ended = true;
      state.winner = { type: 'player', id: alive[0].id };
      alive[0].placement = 1;
      pushLog(state, `${alive[0].name} is the last tribute standing. The Games have a victor.`, { type: 'victory', actors: [alive[0].id] });
      return true;
    }
    if (alive.length === 0) {
      state.ended = true;
      state.winner = null;
      pushLog(state, `No tributes remain. The Games end without a victor.`, { type: 'victory' });
      return true;
    }
    if (state.settings.teamVictory) {
      const teamIds = new Set(alive.map(p => p.teamId).filter(Boolean));
      const anySolo = alive.some(p => !p.teamId);
      if (!anySolo && teamIds.size === 1) {
        state.ended = true;
        const team = getTeam(state, [...teamIds][0]);
        state.winner = { type: 'team', id: team.id };
        for (const p of alive) p.placement = 1;
        pushLog(state, `${team.name} stands alone. The Games have a victor.`, { type: 'victory', actors: alive.map(p => p.id) });
        return true;
      }
    }
    return false;
  }

  function advancePhase(state) {
    if (state.ended) return state;
    const startIdx = state.log.length;

    if (state.phaseType === 'bloodbath') {
      runBloodbath(state);
    } else {
      // tick locationStatus & globalStatus
      for (const locId of Object.keys(state.locationStatus)) {
        const st = state.locationStatus[locId];
        if (st.turnsLeft !== 9999) st.turnsLeft--;
        if (st.turnsLeft < 0) delete state.locationStatus[locId];
      }
      state.globalStatus = state.globalStatus.filter(s => --s.turnsLeft >= 0);

      const alive = alivePlayers(state);
      for (const p of alive) {
        tickNeeds(state, p);
        tickStatusEffects(state, p);
        // ambient hazards
        const hz = state.locationStatus[p.location];
        if (hz && (hz.tag === 'wildfire' || hz.tag === 'fog')) {
          p.health = clamp(p.health - randInt(4, 10), 0, 100);
        }
      }
      // deaths from needs (stop as soon as we're down to a single survivor so we
      // don't manufacture unnecessary double-KOs when order would have spared one)
      for (const p of alive) {
        if (alivePlayers(state).length <= 1) break;
        if (p.alive && p.health <= 0) {
          const cause = p.hunger <= 0 && p.thirst <= 0 ? 'starvation and dehydration' : (p.thirst <= 0 ? 'dehydration' : (p.hunger <= 0 ? 'starvation' : 'their injuries'));
          killPlayer(state, p, cause, null);
          pushLog(state, `${p.name} succumbs to ${cause}.`, { type: 'death', actors: [p.id] });
        }
      }

      maybeArenaEvent(state);
      if (checkWin(state)) return state;
      maybeTwist(state);
      if (checkWin(state)) return state;

      const stillAlive = alivePlayers(state);
      for (const p of stillAlive) autoConsume(state, p);

      // group by location for encounters
      const byLoc = {};
      for (const p of stillAlive) (byLoc[p.location] = byLoc[p.location] || []).push(p);
      for (const locId of Object.keys(byLoc)) {
        resolveLocationEncounters(state, locId, byLoc[locId]);
      }

      // team upkeep (betrayal checks) - copy list since teams can mutate
      for (const team of [...state.teams]) teamUpkeep(state, team);

      if (checkWin(state)) return state;

      // solo actions for anyone still alive and not already "used" this phase
      // (encounters already represent an action for involved champions; simplest
      // model: everyone alive still gets exactly one solo action opportunity
      // per phase, layering naturally on top of any encounter that happened)
      for (const p of alivePlayers(state)) {
        if (Math.random() < 0.85) soloAction(state, p);
      }

      for (const p of alivePlayers(state)) trySponsor(state, p);

      // final need-based deaths after actions
      for (const p of alivePlayers(state)) {
        if (alivePlayers(state).length <= 1) break;
        if (p.health <= 0) {
          killPlayer(state, p, 'their injuries', null);
          pushLog(state, `${p.name} succumbs to their injuries.`, { type: 'death', actors: [p.id] });
        }
      }
    }

    checkWin(state);
    state.phaseIndex++;
    if (!state.ended) {
      const np = nextPhaseType(state);
      state.day = np.day;
      state.phaseType = np.type;
    }
    return state;
  }

  return {
    LOC_MAP, TRAIT_MAP, LOCATIONS, TRAITS,
    createPlayer, createGame, phaseLabel, advancePhase, alivePlayers,
    getPlayer, getTeam, teammates, sharedInventory, getMod, weaponIn,
  };
}));
