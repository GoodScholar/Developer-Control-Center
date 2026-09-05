import { randomUUID } from 'node:crypto'
import { link, open, realpath, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  ControlCenterError,
  projectConfigurationAlreadyExists,
  projectDirectoryUnavailable
} from './errors'
import type { HostRuntime, ProjectDirectory } from './host-runtime'

const unavailableErrorCodes = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'])

function rethrowFileSystemError(error: unknown, rootPath: string): never {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
  if (code && unavailableErrorCodes.has(code)) throw projectDirectoryUnavailable(rootPath)
  throw error
}

export class NodeHostRuntime implements HostRuntime {
  constructor(private readonly nextStagingId: () => string = randomUUID) {}

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

  async createProjectConfiguration(rootPath: string, source: string): Promise<void> {
    const targetPath = join(rootPath, '.devcontrol.toml')
    const stagingPath = join(rootPath, `.devcontrol.toml.tmp-${this.nextStagingId()}`)
    let handle: Awaited<ReturnType<typeof open>> | undefined
    let stagingCreated = false

    try {
      handle = await open(stagingPath, 'wx')
      stagingCreated = true
      await handle.writeFile(source, { encoding: 'utf8' })
      await handle.sync()
      await handle.close()
      handle = undefined
      try {
        await link(stagingPath, targetPath)
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw projectConfigurationAlreadyExists()
        }
        throw error
      }
    } catch (error) {
      if (handle) {
        try {
          await handle.close()
        } catch {
          // The original write/sync/close error remains authoritative.
        }
      }
      if (error instanceof ControlCenterError) throw error
      rethrowFileSystemError(error, rootPath)
    } finally {
      if (stagingCreated) {
        try {
          await rm(stagingPath, { force: true })
        } catch {
          // Staging cleanup never changes the published result or original error.
        }
      }
    }
  }
}
