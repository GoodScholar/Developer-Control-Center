import { projectDirectoryUnavailable } from '../errors'
import type { HostRuntime, ProjectDirectory } from '../host-runtime'

export class TestHostRuntime implements HostRuntime {
  constructor(private readonly directories: ReadonlyMap<string, ProjectDirectory>) {}

  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    const directory = this.directories.get(rootPath)
    if (!directory) throw projectDirectoryUnavailable(rootPath)
    return directory
  }
}
