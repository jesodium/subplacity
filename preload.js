const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchSubplaces: (placeId) => ipcRenderer.invoke('fetch-subplaces', placeId),
  openPlace: (placeId) => ipcRenderer.invoke('open-place', placeId),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text)
});