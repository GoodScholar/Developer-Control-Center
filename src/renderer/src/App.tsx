import { useEffect, useState } from 'react'
import type { ActionableError, DesktopApi, ProjectSnapshot } from '../../shared/contracts'

interface AppProps {
  desktop: DesktopApi
}

export function App({ desktop }: AppProps) {
  const [projects, setProjects] = useState<ProjectSnapshot[]>([])
  const [error, setError] = useState<ActionableError | null>(null)

  useEffect(() => {
    let active = true

    void desktop.projects.list().then((result) => {
      if (!active) return
      if (result.ok) {
        setProjects(result.value)
        setError(null)
      } else {
        setError(result.error)
      }
    })

    return () => {
      active = false
    }
  }, [desktop])

  async function addProject() {
    const result = await desktop.projects.add()
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.value === null) return

    const addedProject = result.value
    setProjects((current) => [
      ...current.filter((project) => project.id !== addedProject.id),
      addedProject
    ])
    setError(null)
  }

  async function removeProject(projectId: string) {
    const result = await desktop.projects.remove(projectId)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setProjects((current) => current.filter((project) => project.id !== projectId))
    setError(null)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local workspace</p>
          <h1>Developer Control Center</h1>
          <p className="introduction">Register local repositories and keep their development services in view.</p>
        </div>
        <button className="primary-action" type="button" onClick={addProject}>
          Add project
        </button>
      </header>

      {error ? (
        <section className="action-error" role="alert">
          <strong>{error.message}</strong>
          <span>{error.nextAction}</span>
        </section>
      ) : null}

      <section className="projects" aria-labelledby="projects-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Projects</p>
            <h2 id="projects-heading">Registered projects</h2>
          </div>
          <span className="project-count" aria-label={`${projects.length} registered projects`}>
            {projects.length}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No projects yet</p>
            <p>Add a local repository to begin managing its development services.</p>
          </div>
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li className="project-row" key={project.id}>
                <div className="project-summary">
                  <div className="project-title-row">
                    <h3>{project.name}</h3>
                    <span className={`status status-${project.availability}`}>
                      {project.availability === 'available' ? 'Available' : 'Missing'}
                    </span>
                  </div>
                  <p className="project-path">{project.rootPath}</p>
                  {project.availability === 'missing' ? (
                    <div className="project-problem" role="alert">
                      <strong>{project.problem.message}</strong>
                      <span>{project.problem.nextAction}</span>
                    </div>
                  ) : null}
                </div>
                <button
                  className="secondary-action"
                  type="button"
                  aria-label={`Remove ${project.name}`}
                  onClick={() => removeProject(project.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
