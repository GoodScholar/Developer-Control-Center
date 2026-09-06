export interface ProjectDirectory {
  canonicalPath: string
  name: string
}

export type PackageJsonDetectionInspection =
  | { kind: 'configuration-exists' }
  | { kind: 'package-json-missing' }
  | { kind: 'package-json'; source: string }

export interface HostRuntime {
  inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>
  inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection>
  createProjectConfiguration(rootPath: string, source: string): Promise<void>
}
