const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const axios = require('axios');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // hi
  // bye
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

// IPC Handlers
ipcMain.handle('fetch-subplaces', async (event, placeId) => {
  try {
    // Get universe ID
    const universeUrl = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const universeResp = await axios.get(universeUrl);
    const universeId = universeResp.data.universeId;

    // Fetch all places
    let allPlaces = [];
    let cursor = null;

    while (true) {
      let url = `https://develop.roblox.com/v1/universes/${universeId}/places?limit=100`;
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      const placesResp = await axios.get(url);
      allPlaces = allPlaces.concat(placesResp.data.data);

      if (placesResp.data.nextPageCursor) {
        cursor = placesResp.data.nextPageCursor;
      } else {
        break;
      }
    }

    return { success: true, places: allPlaces };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data?.message || error.message 
    };
  }
});

ipcMain.handle('open-place', async (event, placeId) => {
  try {
    await shell.openExternal(`roblox://experiences/start?placeId=${placeId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});