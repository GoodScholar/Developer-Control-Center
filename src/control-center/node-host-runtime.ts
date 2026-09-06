import { randomUUID } from 'node:crypto'
import { link, lstat, open, readFile, realpath, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import {
  ControlCenterError,
  packageJsonOutsideProject,
  packageJsonReadFailed,
  projectConfigurationAlreadyExists,
  projectDirectoryUnavailable
} from './errors'
import type { HostRuntime, PackageJsonDetectionInspection, ProjectDirectory } from './host-runtime'

const unavailableErrorCodes = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'])

function rethrowFileSystemError(error: unknown, rootPath: string): never {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
  if (code && unavailableErrorCodes.has(code)) throw projectDirectoryUnavailable(rootPath)
  throw error
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function isContained(rootPath: string, targetPath: string): boolean {
  const candidate = relative(rootPath, targetPath)
  return candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)
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

  async inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection> {
    const configurationPath = join(rootPath, '.devcontrol.toml')
    try {
      await lstat(configurationPath)
      return { kind: 'configuration-exists' }
    } catch (error) {
      if (!isMissing(error)) throw packageJsonReadFailed()
    }

    const packagePath = join(rootPath, 'package.json')
    try {
      await lstat(packagePath)
    } catch (error) {
      if (isMissing(error)) return { kind: 'package-json-missing' }
      throw packageJsonReadFailed()
    }

    let resolvedPath: string
    try {
      resolvedPath = await realpath(packagePath)
    } catch {
      throw packageJsonReadFailed()
    }
    if (!isContained(rootPath, resolvedPath)) throw packageJsonOutsideProject()

    try {
      const details = await stat(resolvedPath)
      if (!details.isFile()) throw packageJsonReadFailed()
      return { kind: 'package-json', source: await readFile(resolvedPath, 'utf8') }
    } catch (error) {
      if (error instanceof ControlCenterError) throw error
      throw packageJsonReadFailed()
    }
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
