import { dialog, type BrowserWindow } from 'electron'

export interface ProjectDirectoryPicker {
  chooseProjectDirectory(): Promise<string | null>
}

export function createProjectDirectoryPicker(
  mainWindow: BrowserWindow
): ProjectDirectoryPicker {
  return {
    async chooseProjectDirectory() {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    }
  }
}
