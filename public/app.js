/* ===================================================================
   Living Dex Tracker — client logic
   =================================================================== */

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='42' fill='none' stroke='%23b9c1cd' stroke-width='6'/%3E%3Cline x1='8' y1='50' x2='92' y2='50' stroke='%23b9c1cd' stroke-width='6'/%3E%3Ccircle cx='50' cy='50' r='13' fill='none' stroke='%23b9c1cd' stroke-width='6'/%3E%3C/svg%3E";

// ---- state ----
let DATA = null;
const gamesById = {};
const progress = { normal: {}, shiny: {} }; // gameId -> Set(ids)

const state = {
  gameId: localStorage.getItem('ld-game') || 'national',
  mode: localStorage.getItem('ld-mode') || 'normal',
  spriteStyle: localStorage.getItem('ld-sprite') || 'home',
  filter: 'all',
  gen: 0,
  search: '',
  view: 'tracker',
};

// ---- element refs ----
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const gameSelect = $('gameSelect');
const emptyNote = $('emptyNote');
const summaryEl = $('summary');

// ---- sprite helpers ----
function spriteUrl(id, mode, style) {
  if (style === 'pixel') {
    return mode === 'shiny' ? `${SPRITE_BASE}/shiny/${id}.png` : `${SPRITE_BASE}/${id}.png`;
  }
  return mode === 'shiny' ? `${SPRITE_BASE}/other/home/shiny/${id}.png` : `${SPRITE_BASE}/other/home/${id}.png`;
}
window.spriteError = function (img) {
  const card = img.closest('.card');
  const id = card ? card.dataset.id : 0;
  if (img.dataset.fell !== '1') {
    img.dataset.fell = '1';
    img.src = spriteUrl(id, state.mode, 'pixel'); // fall back to retro sprite
  } else {
    img.onerror = null;
    img.src = PLACEHOLDER;
  }
};

// ---- progress helpers ----
function getSet(mode, gameId) {
  if (!progress[mode][gameId]) progress[mode][gameId] = new Set();
  return progress[mode][gameId];
}
function caughtInGame(mode, game) {
  const set = progress[mode][game.id];
  if (!set || !set.size) return 0;
  let n = 0;
  for (const id of game.species) if (set.has(id)) n++;
  return n;
}
function serialize() {
  const out = { version: 1, normal: {}, shiny: {} };
  for (const m of ['normal', 'shiny']) {
    for (const gid in progress[m]) {
      const s = progress[m][gid];
      if (s && s.size) out[m][gid] = [...s];
    }
  }
  return out;
}
function loadProgress(obj) {
  for (const m of ['normal', 'shiny']) {
    const src = (obj && obj[m]) || {};
    for (const gid in src) progress[m][gid] = new Set(src[gid]);
  }
}

// ---- saving ----
let saveTimer = null;
function setSaveState(kind) {
  const el = $('saveState');
  el.className = 'save-state' + (kind === 'saving' ? ' saving' : kind === 'error' ? ' error' : '');
  el.textContent = kind === 'saving' ? 'Saving…' : kind === 'error' ? 'Saved locally only' : 'Saved';
}
function scheduleSave() {
  setSaveState('saving');
  try { localStorage.setItem('ld-progress', JSON.stringify(serialize())); } catch (e) {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 500);
}
async function doSave() {
  try {
    const res = await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serialize()),
    });
    if (!res.ok) throw new Error('bad status');
    setSaveState('saved');
    const t = new Date();
    $('footSaved').textContent = 'Last saved ' + t.toLocaleTimeString();
  } catch (e) {
    setSaveState('error'); // localStorage backup already written
  }
}

// ---- grid rendering ----
function pad(id) { return String(id).padStart(3, '0'); }

const numMap = new Map(); // national id -> display (regional) number for current game

function cardHtml(id, no, name, caught, pixelClass, mode, style) {
  return `<button class="card${caught ? ' caught' : ''}${pixelClass}" data-id="${id}" aria-pressed="${caught}" title="${name}">`
    + `<span class="dexno">#${pad(no)}</span>`
    + `<span class="ball"></span>`
    + `<img class="sprite" src="${spriteUrl(id, mode, style)}" alt="${name}" loading="lazy" decoding="async" onerror="spriteError(this)">`
    + `<span class="pname">${name}</span>`
    + `</button>`;
}

function buildGrid() {
  const game = gamesById[state.gameId];
  const mode = state.mode, style = state.spriteStyle;
  const set = getSet(mode, game.id);
  const pixelClass = style === 'pixel' ? ' pixel' : '';
  const nums = game.nums;
  numMap.clear();
  let html = '';
  let i = 0;
  const emit = (count) => {
    for (let k = 0; k < count; k++, i++) {
      const id = game.species[i];
      const no = nums ? nums[i] : id;
      numMap.set(id, no);
      const info = DATA.pokemon[id];
      const name = info ? info.name : '#' + id;
      html += cardHtml(id, no, name, set.has(id), pixelClass, mode, style);
    }
  };
  if (game.sections && game.sections.length > 1) {
    for (const s of game.sections) {
      html += `<div class="dex-section" data-section="1">${s.label} · ${s.count}</div>`;
      emit(s.count);
    }
  } else {
    emit(game.species.length);
  }
  grid.className = 'grid' + (mode === 'shiny' ? ' shiny' : '');
  grid.innerHTML = html;
  applyFilters();
}

// ---- filtering ----
function matches(id) {
  const info = DATA.pokemon[id] || { name: '', gen: 0 };
  if (state.gen && info.gen !== state.gen) return false;
  if (state.filter !== 'all') {
    const caught = getSet(state.mode, state.gameId).has(id);
    if (state.filter === 'caught' && !caught) return false;
    if (state.filter === 'uncaught' && caught) return false;
  }
  if (state.search) {
    const q = state.search.toLowerCase().replace('#', '');
    const no = numMap.get(id);
    const hitName = info.name.toLowerCase().includes(q);
    const hitNum = String(id).includes(q) || (no != null && (String(no).includes(q) || pad(no).includes(q)));
    if (!hitName && !hitNum) return false;
  }
  return true;
}
function applyFilters() {
  const filtering = state.filter !== 'all' || state.search !== '' || state.gen !== 0;
  let visible = 0;
  for (const el of grid.children) {
    if (el.dataset.section) { el.classList.toggle('hide', filtering); continue; }
    const ok = matches(+el.dataset.id);
    el.classList.toggle('hide', !ok);
    if (ok) visible++;
  }
  emptyNote.hidden = visible !== 0;
}

// ---- summary ----
function updateSummary() {
  const game = gamesById[state.gameId];
  const total = game.species.length;
  const caught = caughtInGame(state.mode, game);
  const pct = total ? Math.round((caught / total) * 100) : 0;
  $('summaryGame').textContent = game.name;
  $('summaryRegion').textContent = game.region;
  $('summaryPct').textContent = pct + '%';
  $('summaryBar').style.width = pct + '%';
  $('summaryCounts').textContent = caught + ' / ' + total;
  summaryEl.classList.toggle('shiny', state.mode === 'shiny');
  summaryEl.classList.toggle('complete', pct === 100 && total > 0);
}

// ---- toggle a Pokémon ----
function toggleCard(card) {
  const id = +card.dataset.id;
  const set = getSet(state.mode, state.gameId);
  if (set.has(id)) { set.delete(id); card.classList.remove('caught'); card.setAttribute('aria-pressed', 'false'); }
  else { set.add(id); card.classList.add('caught'); card.setAttribute('aria-pressed', 'true'); }
  updateSummary();
  if (state.filter !== 'all') card.classList.toggle('hide', !matches(id));
  scheduleSave();
}

// ---- reports ----
function pctOf(a, b) { return b ? Math.round((a / b) * 100) : 0; }

function renderReports() {
  const games = DATA.games;
  const nat = gamesById['national'];

  // national card
  const nN = caughtInGame('normal', nat), nS = caughtInGame('shiny', nat), nT = nat.species.length;
  $('natNormalPct').textContent = pctOf(nN, nT) + '%';
  $('natNormalCount').textContent = nN + ' / ' + nT;
  $('natShinyPct').textContent = pctOf(nS, nT) + '%';
  $('natShinyCount').textContent = nS + ' / ' + nT;

  // all combined (Shiny excludes Gen 1 games so 100% stays reachable)
  let aN = 0, aTn = 0, aS = 0, aTs = 0;
  for (const g of games) {
    aN += caughtInGame('normal', g); aTn += g.species.length;
    if (!g.noShiny) { aS += caughtInGame('shiny', g); aTs += g.species.length; }
  }
  $('allNormalPct').textContent = pctOf(aN, aTn) + '%';
  $('allNormalCount').textContent = aN.toLocaleString() + ' / ' + aTn.toLocaleString();
  $('allShinyPct').textContent = pctOf(aS, aTs) + '%';
  $('allShinyCount').textContent = aS.toLocaleString() + ' / ' + aTs.toLocaleString();

  // per-game table
  let html = '<div class="report-head"><span>Game</span><span>Normal</span><span class="rh-shiny">✨ Shiny</span></div>';
  for (const g of games) {
    const t = g.species.length;
    const cn = caughtInGame('normal', g), pn = pctOf(cn, t);
    const shinyCell = g.noShiny
      ? `<div class="mini-bar shiny na"><div class="track"></div><span class="num">— no shiny</span></div>`
      : (() => { const cs = caughtInGame('shiny', g), ps = pctOf(cs, t);
          return `<div class="mini-bar shiny"><div class="track"><div class="fill" style="width:${ps}%"></div></div><span class="num">${cs}/${t} (${ps}%)</span></div>`; })();
    html += `<div class="report-row" data-game="${g.id}">`
      + `<div class="rg-name">${g.name}<small>${g.region} · ${t}</small></div>`
      + `<div class="mini-bar"><div class="track"><div class="fill" style="width:${pn}%"></div></div><span class="num">${cn}/${t} (${pn}%)</span></div>`
      + shinyCell
      + `</div>`;
  }
  $('reportTable').innerHTML = html;
}

// ---- view switching ----
function setView(view) {
  state.view = view;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $('trackerView').hidden = view !== 'tracker';
  $('reportsView').hidden = view !== 'reports';
  if (view === 'reports') renderReports();
}

// ---- shiny availability (Gen 1 games had no Shiny Pokémon) ----
function applyShinyAvailability() {
  const game = gamesById[state.gameId];
  const noShiny = !!(game && game.noShiny);
  const shinyBtn = document.querySelector('#modeToggle .seg[data-mode="shiny"]');
  shinyBtn.disabled = noShiny;
  shinyBtn.classList.toggle('disabled', noShiny);
  shinyBtn.title = noShiny
    ? 'Red / Blue / Yellow have no Shiny Pokémon (introduced in Gen 2)'
    : 'Track your Shiny living dex';
  if (noShiny && state.mode === 'shiny') { // force back to Normal
    state.mode = 'normal';
    localStorage.setItem('ld-mode', 'normal');
    document.querySelectorAll('#modeToggle .seg').forEach(s => s.classList.toggle('active', s.dataset.mode === 'normal'));
  }
}

// ---- game switching ----
function setGame(gameId) {
  state.gameId = gameId;
  localStorage.setItem('ld-game', gameId);
  state.gen = 0;
  $('genSelect').value = '0';
  $('genControl').hidden = gameId !== 'national';
  applyShinyAvailability();
  buildGrid();
  updateSummary();
}

// ---- init UI ----
function populateGameSelect() {
  let html = '';
  let lastGen = -1;
  for (const g of DATA.games) {
    if (g.id === 'national') { html += `<option value="national">★ ${g.name}</option>`; continue; }
    html += `<option value="${g.id}">Gen ${g.gen} — ${g.name}</option>`;
  }
  gameSelect.innerHTML = html;
  gameSelect.value = state.gameId;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ld-theme', theme);
  $('themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function wireEvents() {
  // grid clicks
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) toggleCard(card);
  });

  // game select
  gameSelect.addEventListener('change', () => setGame(gameSelect.value));

  // mode toggle
  $('modeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    localStorage.setItem('ld-mode', state.mode);
    document.querySelectorAll('#modeToggle .seg').forEach(s => s.classList.toggle('active', s === btn));
    buildGrid();
    updateSummary();
  });

  // search
  $('search').addEventListener('input', (e) => { state.search = e.target.value.trim(); applyFilters(); });

  // filter
  $('filterSelect').addEventListener('change', (e) => { state.filter = e.target.value; applyFilters(); });

  // gen
  $('genSelect').addEventListener('change', (e) => { state.gen = +e.target.value; applyFilters(); });

  // sprite style
  $('spriteToggle').addEventListener('click', () => {
    state.spriteStyle = state.spriteStyle === 'home' ? 'pixel' : 'home';
    localStorage.setItem('ld-sprite', state.spriteStyle);
    $('spriteLabel').textContent = state.spriteStyle === 'home' ? 'HOME' : 'Pixel';
    buildGrid();
  });

  // theme
  $('themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // view tabs
  document.querySelectorAll('.view-tab').forEach(tab =>
    tab.addEventListener('click', () => setView(tab.dataset.view)));

  // report rows -> jump to tracker
  $('reportTable').addEventListener('click', (e) => {
    const row = e.target.closest('.report-row');
    if (!row) return;
    gameSelect.value = row.dataset.game;
    setGame(row.dataset.game);
    setView('tracker');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // mark all / clear
  $('markAllBtn').addEventListener('click', () => {
    const game = gamesById[state.gameId];
    const set = getSet(state.mode, game.id);
    game.species.forEach(id => set.add(id));
    buildGrid(); updateSummary(); scheduleSave();
  });
  $('clearAllBtn').addEventListener('click', () => {
    const game = gamesById[state.gameId];
    const label = state.mode === 'shiny' ? 'shiny' : 'normal';
    if (!confirm(`Clear all ${label} check-offs for ${game.name}?`)) return;
    getSet(state.mode, game.id).clear();
    buildGrid(); updateSummary(); scheduleSave();
  });
}

// ---- boot ----
async function boot() {
  // theme first (avoid flash)
  const savedTheme = localStorage.getItem('ld-theme')
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  // sprite label
  $('spriteLabel').textContent = state.spriteStyle === 'home' ? 'HOME' : 'Pixel';
  // mode toggle active
  document.querySelectorAll('#modeToggle .seg').forEach(s => s.classList.toggle('active', s.dataset.mode === state.mode));

  // load data
  DATA = await (await fetch('data/pokedex.json')).json();
  for (const g of DATA.games) gamesById[g.id] = g;
  if (!gamesById[state.gameId]) state.gameId = 'national';

  // load progress (server first, then localStorage backup)
  let prog = null;
  try {
    const res = await fetch('/api/progress');
    if (res.ok) prog = await res.json();
  } catch (e) {}
  const hasServer = prog && ((prog.normal && Object.keys(prog.normal).length) || (prog.shiny && Object.keys(prog.shiny).length));
  if (!hasServer) {
    try { const local = localStorage.getItem('ld-progress'); if (local) prog = JSON.parse(local); } catch (e) {}
  }
  loadProgress(prog || {});

  populateGameSelect();
  $('genControl').hidden = state.gameId !== 'national';
  wireEvents();
  applyShinyAvailability();
  buildGrid();
  updateSummary();
  setSaveState('saved');
}

boot();
