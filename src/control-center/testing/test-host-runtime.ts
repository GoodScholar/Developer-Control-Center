import { projectDirectoryUnavailable } from '../errors'
import type { HostRuntime, ProjectDirectory } from '../host-runtime'

export interface CreatedProjectConfiguration {
  rootPath: string
  source: string
}

export class TestHostRuntime implements HostRuntime {
  readonly createdProjectConfigurations: CreatedProjectConfiguration[] = []

  constructor(private readonly directories: ReadonlyMap<string, ProjectDirectory>) {}

  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    const directory = this.directories.get(rootPath)
    if (!directory) throw projectDirectoryUnavailable(rootPath)
    return directory
  }

  async createProjectConfiguration(rootPath: string, source: string): Promise<void> {
    this.createdProjectConfigurations.push({ rootPath, source })
  }
}
