import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { ControlCenter } from '../control-center/control-center'
import { invalidProjectId } from '../control-center/errors'
import { authorizedResult } from './ipc-result'
import type { ProjectDirectoryPicker } from './project-directory-picker'

export function registerProjectIpc(
  ipc: Pick<IpcMain, 'handle'>,
  controlCenter: ControlCenter,
  picker: ProjectDirectoryPicker,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  ipc.handle('projects:list', (event) =>
    authorizedResult(event, isTrustedSender, 'project', () => controlCenter.listProjects())
  )
  ipc.handle('projects:add', (event) =>
    authorizedResult(event, isTrustedSender, 'project', async () => {
      const rootPath = await picker.chooseProjectDirectory()
      return rootPath === null ? null : controlCenter.registerProject(rootPath)
    })
  )
  ipc.handle('projects:remove', (event, projectId: unknown) =>
    authorizedResult(event, isTrustedSender, 'project', async () => {
      if (typeof projectId !== 'string' || projectId.length === 0) {
        throw invalidProjectId()
      }
      await controlCenter.unregisterProject(projectId)
      return null
    })
  )
}
