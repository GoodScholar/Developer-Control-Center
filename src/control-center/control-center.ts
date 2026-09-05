import { randomUUID } from 'node:crypto'
import type {
  ProjectConfigurationCreated,
  ProjectConfigurationDraft,
  ProjectConfigurationPreview,
  ProjectSnapshot
} from '../shared/contracts'
import {
  ControlCenterError,
  invalidProjectId,
  projectDirectoryUnavailable,
  projectNotFound,
  withProjectId
} from './errors'
import type { HostRuntime, ProjectDirectory } from './host-runtime'
import { buildProjectConfigurationPreview } from './project-configuration'
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

  async previewProjectConfiguration(
    projectId: string,
    draft: ProjectConfigurationDraft
  ): Promise<ProjectConfigurationPreview> {
    return (await this.prepareProjectConfiguration(projectId, draft)).preview
  }

  async createProjectConfiguration(
    projectId: string,
    draft: ProjectConfigurationDraft
  ): Promise<ProjectConfigurationCreated> {
    const prepared = await this.prepareProjectConfiguration(projectId, draft)
    try {
      await this.hostRuntime.createProjectConfiguration(prepared.rootPath, prepared.preview.source)
    } catch (error) {
      if (error instanceof ControlCenterError) throw withProjectId(error, prepared.projectId)
      throw error
    }
    return { relativePath: '.devcontrol.toml' }
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
    } catch (error) {
      if (!(error instanceof ControlCenterError) || error.detail.code !== 'PROJECT_DIRECTORY_UNAVAILABLE') {
        throw error
      }
      return {
        ...project,
        availability: 'missing',
        problem: projectDirectoryUnavailable(project.rootPath, project.id).detail
      }
    }
  }

  private async prepareProjectConfiguration(
    projectId: string,
    draft: ProjectConfigurationDraft
  ): Promise<{ projectId: string; rootPath: string; preview: ProjectConfigurationPreview }> {
    if (typeof projectId !== 'string' || projectId.trim().length === 0) throw invalidProjectId()
    const project = this.projectRegistry.get(projectId)
    if (project === null) throw projectNotFound(projectId)
    let directory: ProjectDirectory
    try {
      directory = await this.hostRuntime.inspectProjectDirectory(project.rootPath)
    } catch (error) {
      if (error instanceof ControlCenterError) throw withProjectId(error, project.id)
      throw error
    }
    try {
      return {
        projectId: project.id,
        rootPath: directory.canonicalPath,
        preview: buildProjectConfigurationPreview(draft)
      }
    } catch (error) {
      if (error instanceof ControlCenterError) throw withProjectId(error, project.id)
      throw error
    }
  }
}
