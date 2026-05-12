import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startServer } from './server'
import { ensureWorkspace, getWorkspaceDir } from './workspace'

let apiPort = 0

function devIconPath(): string | undefined {
  if (app.isPackaged) return undefined // packaged: the .exe already carries the icon
  const p = join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(p) ? p : undefined
}

async function createWindow(): Promise<void> {
  ensureWorkspace()
  if (!apiPort) apiPort = await startServer()

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d14',
    title: 'Marketing Agent',
    icon: devIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-api-port', () => apiPort)
ipcMain.handle('open-workspace', () => {
  const dir = getWorkspaceDir()
  shell.openPath(dir)
  return dir
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
