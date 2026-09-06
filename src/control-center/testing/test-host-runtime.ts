import { projectDirectoryUnavailable } from '../errors'
import type {
  HostRuntime,
  PackageJsonDetectionInspection,
  ProjectDirectory
} from '../host-runtime'

export interface CreatedProjectConfiguration {
  rootPath: string
  source: string
}

export class TestHostRuntime implements HostRuntime {
  readonly createdProjectConfigurations: CreatedProjectConfiguration[] = []
  readonly packageJsonDetectionInspections: string[] = []

  constructor(
    private readonly directories: ReadonlyMap<string, ProjectDirectory>,
    private readonly detections: ReadonlyMap<string, PackageJsonDetectionInspection> = new Map(),
    private readonly detectionErrors: ReadonlyMap<string, unknown> = new Map()
  ) {}

  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    const directory = this.directories.get(rootPath)
    if (!directory) throw projectDirectoryUnavailable(rootPath)
    return directory
  }

  async inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection> {
    this.packageJsonDetectionInspections.push(rootPath)
    if (this.detectionErrors.has(rootPath)) throw this.detectionErrors.get(rootPath)
    return this.detections.get(rootPath) ?? { kind: 'package-json-missing' }
  }

  async createProjectConfiguration(rootPath: string, source: string): Promise<void> {
    this.createdProjectConfigurations.push({ rootPath, source })
  }
}
