interface ProjectIdentity {
  id: string
  name: string
  rootPath: string
}

export type ProjectSnapshot =
  | (ProjectIdentity & { availability: 'available' })
  | (ProjectIdentity & { availability: 'missing'; problem: ActionableError })

export interface ActionableError {
  code: string
  resource: { kind: 'project'; id?: string } | { kind: 'application' }
  message: string
  nextAction: string
}

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ActionableError }

export interface DesktopApi {
  projects: {
    list(): Promise<ActionResult<ProjectSnapshot[]>>
    add(): Promise<ActionResult<ProjectSnapshot | null>>
    remove(projectId: string): Promise<ActionResult<null>>
  }
}
