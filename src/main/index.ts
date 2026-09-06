import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { ControlCenter } from '../control-center/control-center'
import { NodeHostRuntime } from '../control-center/node-host-runtime'
import { SqliteProjectRegistry } from '../control-center/sqlite-project-registry'
import { createMainWindow } from './create-window'
import { createProjectDirectoryPicker } from './project-directory-picker'
import { registerDetectionProposalIpc } from './register-detection-proposal-ipc'
import { registerProjectConfigurationIpc } from './register-project-configuration-ipc'
import { registerProjectIpc } from './register-project-ipc'

let controlCenter: ControlCenter | undefined

if (process.env.DCC_E2E_USER_DATA) {
  app.setPath('userData', process.env.DCC_E2E_USER_DATA)
}

void app.whenReady().then(() => {
  const mainWindow = createMainWindow()
  const databasePath = join(app.getPath('userData'), 'developer-control-center.sqlite3')
  controlCenter = new ControlCenter(
    new SqliteProjectRegistry(databasePath),
    new NodeHostRuntime(),
    randomUUID
  )
  const isTrustedSender = (event: Electron.IpcMainInvokeEvent) =>
    event.senderFrame === mainWindow.webContents.mainFrame
  registerProjectIpc(
    ipcMain,
    controlCenter,
    createProjectDirectoryPicker(mainWindow),
    isTrustedSender
  )
  registerProjectConfigurationIpc(ipcMain, controlCenter, isTrustedSender)
  registerDetectionProposalIpc(ipcMain, controlCenter, isTrustedSender)
})

app.on('before-quit', () => {
  controlCenter?.close()
  controlCenter = undefined
})

app.on('window-all-closed', () => app.quit())
