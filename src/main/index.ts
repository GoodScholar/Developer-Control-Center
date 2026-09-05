import { app } from 'electron'
import { createMainWindow } from './create-window'

if (process.env.DCC_E2E_USER_DATA) app.setPath('userData', process.env.DCC_E2E_USER_DATA)
void app.whenReady().then(createMainWindow)
app.on('window-all-closed', () => app.quit())
