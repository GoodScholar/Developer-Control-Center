import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts'

contextBridge.exposeInMainWorld('desktop', {
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as ReturnType<DesktopApi['projects']['list']>,
    add: () => ipcRenderer.invoke('projects:add') as ReturnType<DesktopApi['projects']['add']>,
    remove: (projectId: string) =>
      ipcRenderer.invoke('projects:remove', projectId) as ReturnType<DesktopApi['projects']['remove']>
  }
} satisfies DesktopApi)
