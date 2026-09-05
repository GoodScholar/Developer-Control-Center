import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, ProjectConfigurationDraft } from '../shared/contracts'

contextBridge.exposeInMainWorld('desktop', {
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as ReturnType<DesktopApi['projects']['list']>,
    add: () => ipcRenderer.invoke('projects:add') as ReturnType<DesktopApi['projects']['add']>,
    remove: (projectId: string) =>
      ipcRenderer.invoke('projects:remove', projectId) as ReturnType<DesktopApi['projects']['remove']>
  },
  projectConfigurations: {
    preview: (projectId: string, draft: ProjectConfigurationDraft) =>
      ipcRenderer.invoke('project-configurations:preview', { projectId, draft }) as
        ReturnType<DesktopApi['projectConfigurations']['preview']>,
    create: (projectId: string, draft: ProjectConfigurationDraft) =>
      ipcRenderer.invoke('project-configurations:create', { projectId, draft }) as
        ReturnType<DesktopApi['projectConfigurations']['create']>
  }
} satisfies DesktopApi)
