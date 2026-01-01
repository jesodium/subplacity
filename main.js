const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const axios = require('axios');
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
      contextIsolation: true, // Secure mode on
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

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

    return { success: true, places: allPlaces };

  } catch (error) {
    console.error(error);
    return { 
      success: false, 
      error: error.response?.data?.message || error.message || "Unknown API Error"
    };
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

// 3. Clipboard
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }

});
