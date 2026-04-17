const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickMaterials: () => ipcRenderer.invoke('pick-materials'),
  pickExport:    () => ipcRenderer.invoke('pick-export'),
  openExport:    () => ipcRenderer.invoke('open-export'),
  getConfig:     () => ipcRenderer.invoke('get-config'),
});
