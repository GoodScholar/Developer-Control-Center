import type { ProjectRegistry, StoredProject } from '../project-registry'

export class TestProjectRegistry implements ProjectRegistry {
  private readonly projects = new Map<string, StoredProject>()

  constructor(initialProjects: readonly StoredProject[] = []) {
    initialProjects.forEach((project) => this.projects.set(project.id, project))
  }

  list(): StoredProject[] {
    return [...this.projects.values()]
  }

  get(projectId: string): StoredProject | null {
    return this.projects.get(projectId) ?? null
  }

  insert(project: StoredProject): void {
    this.projects.set(project.id, project)
  }

  remove(projectId: string): void {
    this.projects.delete(projectId)
  }

  close(): void {}
}
