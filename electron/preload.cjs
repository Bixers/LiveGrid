const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveGridPreferences', {
  read: () => ipcRenderer.sendSync('livegrid:preferences:read'),
  write: (value) => ipcRenderer.send('livegrid:preferences:write', value),
});

contextBridge.exposeInMainWorld('liveGridNativePlayer', {
  command: (value) => ipcRenderer.send('livegrid:native-player:command', value),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('livegrid:native-player:event', listener);
    return () => ipcRenderer.removeListener('livegrid:native-player:event', listener);
  },
});
