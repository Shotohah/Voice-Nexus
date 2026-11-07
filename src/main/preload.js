const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceNexus', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getVersion: () => ipcRenderer.invoke('app:getVersion')
});
