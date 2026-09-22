const $ = (id) => document.getElementById(id);

// IMPORTANT NOTE: library lives in localStorage (electron persists it in userData).
// Move to a json file via ipc if it ever needs export/sync.
let games = [];
try { games = JSON.parse(localStorage.getItem('games')) || []; } catch {}
const save = () => localStorage.setItem('games', JSON.stringify(games));

let current = null;

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function meta(title, dev) {
    const m = el('div', 'meta');
    m.append(el('div', 'title', title), el('div', 'dev', dev));
    return m;
}

const favRows = () => games.flatMap(g => g.places.filter(p => g.favs.includes(p.id)).map(p => ({ p, g })));

function makeCard(title, dev, thumb, onOpen) {
    const card = el('div', 'card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${title}, ${dev}`);
    if (thumb) { const img = el('img'); img.src = thumb; img.alt = ''; card.append(img); }
    card.append(meta(title, dev));
    card.onclick = onOpen;
    card.onkeydown = (e) => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } };
    return card;
}

// --- home: new game, favorites card, then saved games ---
function renderHome() {
    current = null;
    $('gameView').hidden = true;
    $('home').hidden = false;
    const grid = $('grid');
    grid.replaceChildren();

    const add = el('button', 'card new', '+ new game');
    add.onclick = openAdd;
    grid.append(add);

    const favs = favRows();
    if (favs.length) {
        const card = makeCard('saved favorite subplaces', `${favs.length} subplace(s)`, null, openFavs);
        card.classList.add('favs');
        // collage of up to 4 distinct game thumbnails: 1 full, 2 side by side, 3 columns, 4 as 2x2
        const thumbs = [...new Set(favs.map(f => f.g.thumb).filter(Boolean))].slice(0, 4);
        const collage = el('div', 'collage');
        collage.style.setProperty('--cols', thumbs.length === 4 ? 2 : thumbs.length || 1);
        for (const t of thumbs) { const img = el('img'); img.src = t; img.alt = ''; collage.append(img); }
        const star = el('span', 'fav-star', '★');
        star.setAttribute('aria-hidden', 'true');
        card.prepend(collage, star);
        grid.append(card);
    }

    const q = $('searchInput').value.trim().toLowerCase();
    for (const g of games) {
        if (q && !`${g.name} ${g.creator}`.toLowerCase().includes(q)) continue;
        const card = makeCard(g.name, g.creator, g.thumb, () => openGame(g));
        const remove = el('button', 'remove', '×');
        remove.title = 'remove game';
        remove.setAttribute('aria-label', `remove ${g.name}`);
        remove.onclick = async (e) => {
            e.stopPropagation();
            if (!await confirmRemove(g.name)) return;
            games = games.filter(x => x !== g);
            save();
            renderHome();
        };
        card.append(remove);
        grid.append(card);
    }
}

$('searchInput').oninput = renderHome;

// --- game page / favorites page: same layout ---
function showView(title, dev, thumb, rows, showFrom) {
    $('home').hidden = true;
    $('gameView').hidden = false;
    $('heroImg').src = thumb || '';
    $('heroImg').hidden = !thumb;
    $('heroTitle').textContent = title;
    $('heroDev').textContent = dev;

    const favCount = rows.filter(r => r.g.favs.includes(r.p.id)).length;
    $('placesLabel').textContent = `${rows.length} subplace(s) · ${favCount} favorite(s)`;

    const list = $('places');
    list.replaceChildren();
    for (const { p, g } of rows) {
        const li = el('li');
        const star = el('button', 'star');
        star.setAttribute('aria-label', `favorite ${p.name}`);
        const paint = () => {
            const fav = g.favs.includes(p.id);
            star.textContent = fav ? '★' : '☆';
            star.setAttribute('aria-pressed', fav);
        };
        paint();
        // toggles in place; list re-sorts next time the page opens so rows don't jump under the cursor
        star.onclick = () => {
            const fav = g.favs.includes(p.id);
            g.favs = fav ? g.favs.filter(id => id !== p.id) : [...g.favs, p.id];
            save();
            paint();
            notyf.success(fav ? `unfavorited ${p.name}` : `favorited ${p.name}`);
        };

        const open = el('button', null, 'open');
        open.onclick = () => openPlace(p.id);
        const copy = el('button', null, 'copy');
        copy.onclick = () => copyPlaceId(p.id);

        const name = el('span', 'name', p.name);
        if (showFrom) name.append(' ', el('span', 'from', `(from game: ${g.name})`));
        li.append(star, name, el('span', 'pid', p.id), open, copy);
        list.append(li);
    }
    $('backBtn').focus();
}

function renderGame() {
    const g = current;
    const rows = [...g.places].sort((a, b) => g.favs.includes(b.id) - g.favs.includes(a.id)).map(p => ({ p, g }));
    showView(g.name, g.creator, g.thumb, rows, false);
}

function openFavs() {
    current = 'favs';
    const rows = favRows();
    showView('saved favorite subplaces', `from ${new Set(rows.map(r => r.g)).size} game(s)`, rows[0]?.g.thumb, rows, true);
}

async function openGame(g) {
    current = g;
    renderGame();

    // refresh in background so new subplaces / thumbnails show up
    const r = await window.electronAPI.fetchSubplaces(g.rootPlaceId);
    if (!r.success) return;
    Object.assign(g, r.game, { places: r.places });
    save();
    if (current === g) renderGame();
}

$('backBtn').onclick = renderHome;

async function openPlace(placeId) {
    const r = await window.electronAPI.openPlace(placeId);
    r.success ? notyf.success(`launching ${placeId}`) : notyf.error(r.error);
}

async function copyPlaceId(placeId) {
    const r = await window.electronAPI.copyToClipboard(String(placeId));
    r.success ? notyf.success(`copied ${placeId}`) : notyf.error(r.error);
}

// --- popups: animate in and out ---
function openModal(m, focusEl) {
    m.classList.remove('hidden', 'closing');
    focusEl?.focus();
}
function closeModal(m) {
    if (m.classList.contains('hidden') || m.classList.contains('closing')) return;
    m.classList.add('closing');
    m.addEventListener('animationend', () => m.classList.replace('closing', 'hidden'), { once: true });
}

// --- remove game confirm ---
const confirmOverlay = $('confirmOverlay');
let confirmResolve = null;
function confirmRemove(name) {
    $('confirmText').textContent = `remove ${name} from your library? its favorites go with it.`;
    openModal(confirmOverlay, $('confirmNo'));
    return new Promise(res => { confirmResolve = res; });
}
function answerConfirm(yes) {
    confirmResolve?.(yes);
    confirmResolve = null;
    closeModal(confirmOverlay);
}
$('confirmYes').onclick = () => answerConfirm(true);
$('confirmNo').onclick = () => answerConfirm(false);

// --- new game modal: roblox search by name, or place id / link ---
const addOverlay = $('addOverlay');
const addInput = $('addInput');
const addResults = $('addResults');
function openAdd() {
    addInput.value = '';
    addResults.replaceChildren();
    openModal(addOverlay, addInput);
}
function closeAdd() { closeModal(addOverlay); }

// bare id or a link like roblox.com/games/2753915549/blox-fruits
const idFrom = (v) => /^\d+$/.test(v) || /roblox\.com\/games\/\d+/.test(v) ? v.match(/\d+/)[0] : null;

let searchSeq = 0, searchTimer;
async function searchRoblox() {
    const q = addInput.value.trim();
    const seq = ++searchSeq;
    if (q.length < 2 || idFrom(q)) return addResults.replaceChildren();
    const r = await window.electronAPI.searchGames(q);
    if (seq !== searchSeq) return; // a newer search already started
    if (!r.success) return notyf.error(r.error);
    addResults.replaceChildren(...r.games.map(g => {
        const li = el('li');
        const b = el('button');
        const img = el('img');
        img.src = g.icon;
        img.alt = '';
        const text = el('div');
        text.append(el('div', 'rname', g.name), el('div', 'rdev', g.creator));
        b.append(img, text);
        b.onclick = () => addGame(g.rootPlaceId, b);
        li.append(b);
        return li;
    }));
    if (!r.games.length) addResults.append(el('li', 'rdev', 'no games found'));
}

addInput.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchRoblox, 350); };
addInput.onkeydown = (e) => { if (e.key === 'Enter') $('addGo').click(); };
$('addCancel').onclick = closeAdd;
$('addGo').onclick = (e) => {
    const v = addInput.value.trim();
    const id = idFrom(v);
    if (id) return addGame(id, e.currentTarget);
    const first = addResults.querySelector('button');
    first ? first.click() : searchRoblox();
};

async function addGame(placeId, btn) {
    const label = btn.textContent;
    btn.disabled = true;
    if (btn.id === 'addGo') btn.textContent = 'fetching...';
    try {
        const r = await window.electronAPI.fetchSubplaces(placeId);
        if (!r.success) return notyf.error(r.error);
        if (games.some(g => g.universeId === r.game.universeId)) return notyf.error(`${r.game.name} already saved`);
        games.push({ ...r.game, places: r.places, favs: [] });
        save();
        closeAdd();
        renderHome();
        notyf.success(`added ${r.game.name}`);
    } finally {
        btn.disabled = false;
        if (btn.id === 'addGo') btn.textContent = label;
    }
}

renderHome();

// youtube popup: once ever. skipped this launch if the update popup got there first.
const ytOverlay = $('ytOverlay');
let ytSeen = true;
try { ytSeen = !!localStorage.getItem('ytSeen'); } catch {}
if (!ytSeen) setTimeout(() => {
    if (document.querySelector('.modal:not(.hidden)')) return;
    localStorage.setItem('ytSeen', '1');
    openModal(ytOverlay, $('ytGo'));
}, 2000);
$('ytGo').onclick = () => {
    window.open('https://www.youtube.com/@thiocyanogen?sub_confirmation=1');
    closeModal(ytOverlay);
};
$('ytNo').onclick = () => closeModal(ytOverlay);

// update popup, main process fires this after checking github releases
const updateOverlay = document.getElementById('updateOverlay');
window.electronAPI.onUpdateAvailable(({ latest, current }) => {
    document.getElementById('updateCurrent').textContent = 'v' + current;
    document.getElementById('updateLatest').textContent = 'v' + latest;
    openModal(updateOverlay, document.getElementById('updateGet'));
});
document.getElementById('updateGet').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'updating...';
    await window.electronAPI.installUpdate(); // windows quits + relaunches, mac opens the dmg
    closeModal(updateOverlay);
};
document.getElementById('updateLater').onclick = () => closeModal(updateOverlay);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(updateOverlay); closeModal(ytOverlay); closeAdd(); if (confirmResolve) answerConfirm(false); }
});
