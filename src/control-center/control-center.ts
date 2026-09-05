import { randomUUID } from 'node:crypto'
import type { ProjectSnapshot } from '../shared/contracts'
import { invalidProjectId, projectDirectoryUnavailable } from './errors'
import type { HostRuntime } from './host-runtime'
import type { ProjectRegistry, StoredProject } from './project-registry'

export class ControlCenter {
  constructor(
    private readonly projectRegistry: ProjectRegistry,
    private readonly hostRuntime: HostRuntime,
    private readonly nextId: () => string = randomUUID
  ) {}

  async listProjects(): Promise<ProjectSnapshot[]> {
    const projects = this.projectRegistry.list()
    return Promise.all(projects.map((project) => this.toSnapshot(project)))
  }

  async registerProject(rootPath: string): Promise<ProjectSnapshot> {
    const directory = await this.hostRuntime.inspectProjectDirectory(rootPath)
    const project = {
      id: this.nextId(),
      name: directory.name,
      rootPath: directory.canonicalPath
    }
    this.projectRegistry.insert(project)
    return { ...project, availability: 'available' }
  }

  async unregisterProject(projectId: string): Promise<void> {
    if (!projectId) throw invalidProjectId()
    this.projectRegistry.remove(projectId)
  }

  close(): void {
    this.projectRegistry.close()
  }

  private async toSnapshot(project: StoredProject): Promise<ProjectSnapshot> {
    try {
      const directory = await this.hostRuntime.inspectProjectDirectory(project.rootPath)
      return {
        id: project.id,
        name: directory.name,
        rootPath: directory.canonicalPath,
        availability: 'available'
      }
    } catch {
      return {
        ...project,
        availability: 'missing',
        problem: projectDirectoryUnavailable(project.rootPath, project.id).detail
      }
    }
  }
}
