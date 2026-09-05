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
