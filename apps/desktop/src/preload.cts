import { contextBridge, ipcRenderer } from 'electron';

// The only desktop capabilities the web page gets (DEC-117): its ChatGPT
// connection. Each call is checked again in the main process (app origin).
contextBridge.exposeInMainWorld('caseflowDesktop', {
  chatgpt: {
    status: () => ipcRenderer.invoke('chatgpt:status'),
    connect: () => ipcRenderer.invoke('chatgpt:connect'),
    disconnect: () => ipcRenderer.invoke('chatgpt:disconnect'),
    models: () => ipcRenderer.invoke('chatgpt:models'),
    selectModel: (slug: string) => ipcRenderer.invoke('chatgpt:select-model', slug),
    resume: () => ipcRenderer.invoke('chatgpt:resume'),
    prefer: (chatgpt: boolean) => ipcRenderer.invoke('chatgpt:prefer', String(chatgpt)),
  },
});
