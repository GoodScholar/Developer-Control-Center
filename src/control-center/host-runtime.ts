export interface ProjectDirectory {
  canonicalPath: string
  name: string
}

export interface HostRuntime {
  inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>
}
