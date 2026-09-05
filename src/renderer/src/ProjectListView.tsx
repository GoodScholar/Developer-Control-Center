import type { ActionableError, ProjectSnapshot } from '../../shared/contracts'

interface ProjectListViewProps {
  projects: ProjectSnapshot[]
  error: ActionableError | null
  onAdd(): void
  onRemove(projectId: string): void
  onConfigure(project: Extract<ProjectSnapshot, { availability: 'available' }>): void
}

export function ProjectListView(props: ProjectListViewProps) {
  return <main className="app-shell">
    <header className="app-header">
      <div>
        <p className="eyebrow">Development projects</p>
        <h1>Developer Control Center</h1>
        <p className="introduction">Register development projects and keep their development services in view.</p>
      </div>
      <button className="primary-action" type="button" onClick={props.onAdd}>Add project</button>
    </header>
    {props.error ? <section className="action-error" role="alert"><strong>{props.error.message}</strong><span>{props.error.nextAction}</span></section> : null}
    <section className="projects" aria-labelledby="projects-heading">
      <div className="section-heading">
        <div><p className="eyebrow">Projects</p><h2 id="projects-heading">Registered projects</h2></div>
        <span className="project-count" aria-label={`${props.projects.length} registered projects`}>{props.projects.length}</span>
      </div>
      {props.projects.length === 0 ? <div className="empty-state">
        <p className="empty-title">No projects yet</p><p>Add a development project to begin managing its development services.</p>
      </div> : <ul className="project-list">{props.projects.map((project) => <li className="project-row" key={project.id}>
        <div className="project-summary">
          <div className="project-title-row"><h3>{project.name}</h3><span className={`status status-${project.availability}`}>
            {project.availability === 'available' ? 'Available' : 'Missing'}
          </span></div>
          <p className="project-path">{project.rootPath}</p>
          {project.availability === 'missing' ? <div className="project-problem" role="alert"><strong>{project.problem.message}</strong><span>{project.problem.nextAction}</span></div> : null}
        </div>
        <div className="project-actions">
          {project.availability === 'available' ? <button type="button" className="secondary-action" aria-label={`Configure ${project.name}`} onClick={() => props.onConfigure(project)}>Configure</button> : null}
          <button type="button" className="secondary-action" aria-label={`Remove ${project.name}`} onClick={() => props.onRemove(project.id)}>Remove</button>
        </div>
      </li>)}</ul>}
    </section>
  </main>
}
