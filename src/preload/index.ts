import { contextBridge, ipcRenderer } from 'electron'

const appBridge = {
  /** Port the local HTTP API is listening on (chosen at startup). */
  getApiPort: (): Promise<number> => ipcRenderer.invoke('get-api-port')
}

contextBridge.exposeInMainWorld('appBridge', appBridge)

export type AppBridge = typeof appBridge
