import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { projectDirectoryUnavailable } from './errors'
import type { HostRuntime, ProjectDirectory } from './host-runtime'

export class NodeHostRuntime implements HostRuntime {
  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    try {
      const canonicalPath = await realpath(rootPath)
      const details = await stat(canonicalPath)
      if (!details.isDirectory()) throw projectDirectoryUnavailable(rootPath)

      return { canonicalPath, name: basename(canonicalPath) }
    } catch {
      throw projectDirectoryUnavailable(rootPath)
    }
  }
}
