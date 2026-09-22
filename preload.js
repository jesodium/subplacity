const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchSubplaces: (placeId) => ipcRenderer.invoke('fetch-subplaces', placeId),
  searchGames: (query) => ipcRenderer.invoke('search-games', query),
  openPlace: (placeId) => ipcRenderer.invoke('open-place', placeId),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (e, info) => cb(info)),
  getVersion: () => ipcRenderer.invoke('get-version'),
  installUpdate: () => ipcRenderer.invoke('install-update')
});