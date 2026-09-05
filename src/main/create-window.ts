import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function developmentRendererUrl(): string | null {
  const value = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
  if (!value) return null

  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('ELECTRON_RENDERER_URL must use loopback HTTP')
  }
  return url.toString()
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const developmentUrl = developmentRendererUrl()
  if (developmentUrl) {
    void window.loadURL(developmentUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}
