import { useEffect, useState } from 'react'
import type { ActionableError, DesktopApi, ProjectSnapshot } from '../../shared/contracts'
import { ProjectConfigurationView } from './ProjectConfigurationView'
import { ProjectListView } from './ProjectListView'

interface AppProps {
  desktop: DesktopApi
}

export function App({ desktop }: AppProps) {
  const [projects, setProjects] = useState<ProjectSnapshot[]>([])
  const [error, setError] = useState<ActionableError | null>(null)
  const [configuredProject, setConfiguredProject] = useState<Extract<ProjectSnapshot, { availability: 'available' }> | null>(null)

  useEffect(() => {
    let active = true
    void desktop.projects.list().then((result) => {
      if (!active) return
      if (result.ok) {
        setProjects(() => result.value)
        setError(() => null)
      } else {
        setError(() => result.error)
      }
    })
    return () => { active = false }
  }, [desktop])

  async function addProject() {
    const result = await desktop.projects.add()
    if (!result.ok) {
      setError(() => result.error)
      return
    }
    if (result.value === null) return
    const addedProject = result.value
    setProjects((current) => [...current.filter((project) => project.id !== addedProject.id), addedProject])
    setError(() => null)
  }

  async function removeProject(projectId: string) {
    const result = await desktop.projects.remove(projectId)
    if (!result.ok) {
      setError(() => result.error)
      return
    }
    setProjects((current) => current.filter((project) => project.id !== projectId))
    setError(() => null)
  }

  if (configuredProject) {
    return <ProjectConfigurationView desktop={desktop} project={configuredProject} onBack={() => setConfiguredProject(() => null)} />
  }

  return <ProjectListView
    projects={projects}
    error={error}
    onAdd={() => void addProject()}
    onRemove={(projectId) => void removeProject(projectId)}
    onConfigure={(project) => setConfiguredProject(() => project)}
  />
}
