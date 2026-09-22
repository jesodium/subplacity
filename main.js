const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
app.setName('subplacity'); // if this fixes it im gonna cry

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'subplacity',
    autoHideMenuBar: true, 
    icon: path.join(__dirname, 'build/icon.png'), 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  return mainWindow.loadFile('index.html');
}

// IMPORTANT NOTE: electron-updater only on windows: mac auto-update needs Apple code
// signing we don't have, so mac gets the dmg opened instead. Use electron-updater on
// mac too once the app is signed+notarized.
let release;

async function checkForUpdate() {
  try {
    const { data } = await axios.get(
      'https://api.github.com/repos/jesodium/subplacity/releases/latest',
      { timeout: 5000 }
    );
    // `npm run test:update` passes --fake-version=0.0.0 to force the popup
    const fake = process.argv.find(a => a.startsWith('--fake-version='));
    const current = fake ? fake.split('=')[1] : app.getVersion();
    const latest = String(data.tag_name || '').replace(/^v/, '');
    const cmp = (a, b) => {
      const x = a.split('.').map(Number), y = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
      return 0;
    };
    if (!latest || cmp(latest, current) <= 0) return;

    release = data;
    mainWindow.webContents.send('update-available', { latest, current });
  } catch (e) {
    // offline / rate limited / no releases yet: never block startup over an update check
  }
}

app.whenReady().then(createWindow).then(checkForUpdate);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- IPC HANDLERS ---

// 1. Fetch Subplaces
ipcMain.handle('fetch-subplaces', async (event, placeId) => {
  try {
    if (!/^\d+$/.test(String(placeId))) throw new Error('place id must be a number');
    // A. Get Universe ID from the Place ID
    const universeUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universeResp = await axios.get(universeUrl);
    
    if (!universeResp.data || !universeResp.data.universeId) {
      throw new Error("Could not find Universe ID for this Place.");
    }
    
    const universeId = universeResp.data.universeId;

    // B. Fetch all places in that Universe (handling pagination)
    let allPlaces = [];
    let cursor = null;

    do {
      let url = `https://develop.roblox.com/v1/universes/${universeId}/places?limit=100&sortOrder=Asc`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const placesResp = await axios.get(url);
      
      if (placesResp.data && placesResp.data.data) {
        allPlaces = allPlaces.concat(placesResp.data.data);
        cursor = placesResp.data.nextPageCursor;
      } else {
        cursor = null;
      }
      
    } while (cursor);

    // C. Game card info: name, creator, 16:9 thumbnail (thumb is optional, card falls back to plain bg)
    const [info, thumb] = await Promise.all([
      axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
      axios.get(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=1&size=768x432&format=Png`).catch(() => null)
    ]);
    const g = info.data.data[0] || {};
    const game = {
      universeId,
      rootPlaceId: g.rootPlaceId || Number(placeId),
      name: g.name || `universe ${universeId}`,
      creator: g.creator?.name || 'unknown',
      thumb: thumb?.data?.data?.[0]?.thumbnails?.[0]?.imageUrl || ''
    };

    return { success: true, places: allPlaces, game };

  } catch (error) {
    console.error(error);
    return { 
      success: false, 
      error: error.response?.data?.message || error.message || "Unknown API Error"
    };
  }
});

// 1b. Search roblox games by name (for the new game popup)
ipcMain.handle('search-games', async (event, query) => {
  try {
    const { data } = await axios.get('https://apis.roblox.com/search-api/omni-search', {
      params: { searchQuery: String(query).slice(0, 100), sessionId: 'subplacity', pageType: 'all' },
      timeout: 8000
    });
    const hits = (data.searchResults || [])
      .filter(g => g.contentGroupType === 'Game')
      .flatMap(g => g.contents)
      .filter(g => !g.isSponsored)
      .slice(0, 12);
    if (!hits.length) return { success: true, games: [] };

    const thumbs = await axios.get('https://thumbnails.roblox.com/v1/games/icons', {
      params: { universeIds: hits.map(g => g.universeId).join(','), size: '150x150', format: 'Png' }
    }).catch(() => null);
    const icon = Object.fromEntries((thumbs?.data?.data || []).map(t => [t.targetId, t.imageUrl]));

    return {
      success: true,
      games: hits.map(g => ({ universeId: g.universeId, rootPlaceId: g.rootPlaceId, name: g.name, creator: g.creatorName, icon: icon[g.universeId] || '' }))
    };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || error.message };
  }
});

// 2. Open Place (Deep Link)
ipcMain.handle('open-place', async (event, placeId) => {
  try {
    // Opens Roblox Client directly
    await shell.openExternal(`roblox://experiences/start?placeId=${placeId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 3. Install update
ipcMain.handle('install-update', async () => {
  if (!release) return;
  try {
    if (process.platform === 'win32') {
      // downloads the nsis installer, runs it silently, relaunches the app
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = false;
      await autoUpdater.checkForUpdates();
      await autoUpdater.downloadUpdate();
      autoUpdater.quitAndInstall(true, true);
      return;
    }
    const dmg = release.assets.find(a => a.name.endsWith(`${process.arch}.dmg`));
    if (!dmg) throw new Error('no dmg for ' + process.arch);
    const file = path.join(app.getPath('downloads'), dmg.name);
    const { data } = await axios.get(dmg.browser_download_url, { responseType: 'arraybuffer' });
    fs.writeFileSync(file, Buffer.from(data));
    await shell.openPath(file);
  } catch (e) {
    // anything goes wrong: fall back to the release page so the user can still update
    await shell.openExternal(release.html_url);
  }
});

// 4. App version for the header tag
ipcMain.handle('get-version', () => app.getVersion());

// 5. Clipboard
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }

});

