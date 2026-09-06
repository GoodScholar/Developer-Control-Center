interface ProjectIdentity {
  id: string
  name: string
  rootPath: string
}

export type ProjectSnapshot =
  | (ProjectIdentity & { availability: 'available' })
  | (ProjectIdentity & { availability: 'missing'; problem: ActionableError })

export type PlatformName = 'macos' | 'windows'

export interface EnvironmentVariableDraft {
  key: string
  value: string
}

export interface PlatformOverrideDraft {
  program?: string
  args?: string[]
  env?: EnvironmentVariableDraft[]
}

export interface DevelopmentServiceDraft {
  id: string
  program: string
  args: string[]
  workingDirectory: string
  shell: boolean
  envFiles: string[]
  env: EnvironmentVariableDraft[]
  macos?: PlatformOverrideDraft
  windows?: PlatformOverrideDraft
}

export interface PackageJsonDetectionEvidence {
  kind: 'package_json'
  relativePath: 'package.json'
  scriptName: string
}

export interface PackageJsonDetectionCandidate {
  candidateId: string
  evidence: PackageJsonDetectionEvidence
  draft: DevelopmentServiceDraft
}

export interface PackageJsonDetectionProposal {
  projectId: string
  candidates: PackageJsonDetectionCandidate[]
}

export type DetectionProposalResult =
  | { kind: 'proposal'; proposal: PackageJsonDetectionProposal }
  | { kind: 'none'; reason: 'configuration-exists' | 'package-json-missing' | 'no-candidates' }

export interface ProjectConfigurationDraft {
  services: DevelopmentServiceDraft[]
}

export interface PlatformOverride {
  program?: string
  args?: readonly string[]
  env?: Readonly<Record<string, string>>
}

export interface DevelopmentServiceConfiguration {
  program: string
  args: readonly string[]
  workingDirectory: string
  shell: boolean
  envFiles: readonly string[]
  env: Readonly<Record<string, string>>
  macos?: PlatformOverride
  windows?: PlatformOverride
}

export interface ProjectConfigurationV1 {
  schemaVersion: 1
  services: Readonly<Record<string, DevelopmentServiceConfiguration>>
}

export interface ProjectConfigurationPreview {
  source: string
}

export interface ProjectConfigurationCreated {
  relativePath: '.devcontrol.toml'
}

export type ConfigFieldPath = string

export interface ActionableError {
  code: string
  resource:
    | { kind: 'project'; id?: string }
    | { kind: 'project_configuration'; projectId?: string }
    | { kind: 'application' }
  fieldPath?: ConfigFieldPath
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
  projectConfigurations: {
    preview(
      projectId: string,
      draft: ProjectConfigurationDraft
    ): Promise<ActionResult<ProjectConfigurationPreview>>
    create(
      projectId: string,
      draft: ProjectConfigurationDraft
    ): Promise<ActionResult<ProjectConfigurationCreated>>
  }
  detectionProposals: {
    detect(projectId: string): Promise<ActionResult<DetectionProposalResult>>
  }
}
