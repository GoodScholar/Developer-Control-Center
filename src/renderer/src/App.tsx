import { useEffect, useRef, useState } from 'react'
import type { ActionableError, DesktopApi, PackageJsonDetectionProposal, ProjectSnapshot } from '../../shared/contracts'
import { PackageJsonDetectionProposalView } from './PackageJsonDetectionProposalView'
import { ProjectConfigurationView } from './ProjectConfigurationView'
import { ProjectListView } from './ProjectListView'

interface AppProps {
  desktop: DesktopApi
}

type AvailableProject = Extract<ProjectSnapshot, { availability: 'available' }>

type AppView =
  | { kind: 'list' }
  | { kind: 'detecting'; project: AvailableProject; sequence: number }
  | { kind: 'detection-error'; project: AvailableProject; error: ActionableError }
  | { kind: 'proposal'; project: AvailableProject; proposal: PackageJsonDetectionProposal }
  | { kind: 'manual-configuration'; project: AvailableProject }

export function App({ desktop }: AppProps) {
  const [projects, setProjects] = useState<ProjectSnapshot[]>([])
  const [error, setError] = useState<ActionableError | null>(null)
  const [view, setView] = useState<AppView>({ kind: 'list' })
  const detectionSequence = useRef(0)
  const detectionAlertRef = useRef<HTMLElement>(null)

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

  useEffect(() => {
    if (view.kind === 'detection-error') detectionAlertRef.current?.focus()
  }, [view])

  function showProjectList(): void {
    detectionSequence.current += 1
    setView({ kind: 'list' })
  }

  function showManualConfiguration(project: AvailableProject): void {
    detectionSequence.current += 1
    setView({ kind: 'manual-configuration', project })
  }

  async function detectAfterRegistration(project: AvailableProject): Promise<void> {
    const sequence = ++detectionSequence.current
    setView({ kind: 'detecting', project, sequence })
    const result = await desktop.detectionProposals.detect(project.id)
    if (sequence !== detectionSequence.current) return
    if (!result.ok) {
      setView({ kind: 'detection-error', project, error: result.error })
      return
    }
    setView(result.value.kind === 'proposal'
      ? { kind: 'proposal', project, proposal: result.value.proposal }
      : { kind: 'list' })
  }

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
    if (addedProject.availability === 'available') await detectAfterRegistration(addedProject)
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

  if (view.kind === 'detecting') return <main className="app-shell detection-status">
    <h1>{view.project.name}</h1>
    <p role="status">Detecting project configuration…</p>
    <button type="button" onClick={showProjectList}>Back to projects</button>
  </main>

  if (view.kind === 'detection-error') return <main className="app-shell detection-status">
    <h1>{view.project.name}</h1>
    <section ref={detectionAlertRef} className="action-error" role="alert" tabIndex={-1}>
      <strong>{view.error.message}</strong><span>{view.error.nextAction}</span>
    </section>
    <div className="configuration-actions">
      <button type="button" onClick={showProjectList}>Back to projects</button>
      <button type="button" className="primary-action" onClick={() => showManualConfiguration(view.project)}>Configure manually</button>
    </div>
  </main>

  if (view.kind === 'proposal') return <PackageJsonDetectionProposalView
    desktop={desktop} project={view.project} proposal={view.proposal} onReject={showProjectList} onBack={showProjectList} />

  if (view.kind === 'manual-configuration') return <ProjectConfigurationView
    desktop={desktop} project={view.project} onBack={showProjectList} />

  return <ProjectListView
    projects={projects}
    error={error}
    onAdd={() => void addProject()}
    onRemove={(projectId) => void removeProject(projectId)}
    onConfigure={showManualConfiguration}
  />
}
