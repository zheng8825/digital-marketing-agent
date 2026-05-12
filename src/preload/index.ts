import { contextBridge, ipcRenderer } from 'electron'

const appBridge = {
  /** Port the local HTTP API is listening on (chosen at startup). */
  getApiPort: (): Promise<number> => ipcRenderer.invoke('get-api-port'),
  /** Open the agent's workspace folder in the OS file explorer. Returns the path. */
  openWorkspace: (): Promise<string> => ipcRenderer.invoke('open-workspace')
}

contextBridge.exposeInMainWorld('appBridge', appBridge)

export type AppBridge = typeof appBridge
