import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { projectDirectoryUnavailable } from './errors'
import type { HostRuntime, ProjectDirectory } from './host-runtime'

const unavailableErrorCodes = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'])

function rethrowFileSystemError(error: unknown, rootPath: string): never {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
  if (code && unavailableErrorCodes.has(code)) throw projectDirectoryUnavailable(rootPath)
  throw error
}

export class NodeHostRuntime implements HostRuntime {
  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    let canonicalPath: string
    try {
      canonicalPath = await realpath(rootPath)
    } catch (error) {
      rethrowFileSystemError(error, rootPath)
    }

    let details
    try {
      details = await stat(canonicalPath)
    } catch (error) {
      rethrowFileSystemError(error, rootPath)
    }
    if (!details.isDirectory()) throw projectDirectoryUnavailable(rootPath)

    return { canonicalPath, name: basename(canonicalPath) }
  }
}
