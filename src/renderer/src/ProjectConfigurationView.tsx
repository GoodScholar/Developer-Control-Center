import { useEffect, useRef, useState } from 'react'
import type { ActionableError, DesktopApi, DevelopmentServiceDraft, ProjectConfigurationCreated, ProjectConfigurationDraft, ProjectConfigurationPreview, ProjectSnapshot } from '../../shared/contracts'
import { ConfigurationSuccess } from './ConfigurationSuccess'
import { controlIdForConfigurationField } from './configuration-field-focus'
import { ProjectConfigurationPreviewPanel } from './ProjectConfigurationPreviewPanel'
import { ServiceConfigurationForm } from './ServiceConfigurationForm'

type ConfigurationWorkflowState =
  | { kind: 'editing'; configuration: ProjectConfigurationDraft; error?: ActionableError }
  | { kind: 'previewing'; configuration: ProjectConfigurationDraft; preview: ProjectConfigurationPreview; error?: ActionableError }
  | { kind: 'creating'; configuration: ProjectConfigurationDraft; preview: ProjectConfigurationPreview }
  | { kind: 'created'; result: ProjectConfigurationCreated }

interface ProjectConfigurationViewProps {
  desktop: DesktopApi
  project: Extract<ProjectSnapshot, { availability: 'available' }>
  onBack(): void
}

const initialDraft: ProjectConfigurationDraft = {
  services: [{ id: 'web', program: '', args: [], workingDirectory: '.', shell: false, envFiles: [], env: [] }]
}

function updateService(
  configuration: ProjectConfigurationDraft,
  index: number,
  service: DevelopmentServiceDraft
): ProjectConfigurationDraft {
  return { services: configuration.services.map((current, currentIndex) => currentIndex === index ? service : current) }
}

function controlFor(fieldPath: string | undefined): HTMLElement | null {
  const controlId = controlIdForConfigurationField(fieldPath)
  return controlId === undefined || typeof document === 'undefined' ? null : document.getElementById(controlId)
}

export function ProjectConfigurationView({ desktop, project, onBack }: ProjectConfigurationViewProps) {
  const [state, setState] = useState<ConfigurationWorkflowState>(() => ({ kind: 'editing', configuration: structuredClone(initialDraft) }))
  const previewSequence = useRef(0)
  const createInFlight = useRef(false)
  const alertRef = useRef<HTMLElement>(null)

  function editDraft(nextConfiguration: ProjectConfigurationDraft): void {
    previewSequence.current += 1
    setState(() => ({ kind: 'editing', configuration: nextConfiguration }))
  }

  async function previewConfiguration() {
    if (state.kind !== 'editing') return
    const sequence = ++previewSequence.current
    const configurationSnapshot = structuredClone(state.configuration)
    const result = await desktop.projectConfigurations.preview(project.id, configurationSnapshot)
    if (sequence !== previewSequence.current) return
    setState(() => result.ok
      ? { kind: 'previewing', configuration: configurationSnapshot, preview: result.value }
      : { kind: 'editing', configuration: configurationSnapshot, error: result.error })
  }

  async function createConfiguration() {
    if (state.kind !== 'previewing' || createInFlight.current) return
    createInFlight.current = true
    const snapshot = state
    setState(() => ({ kind: 'creating', configuration: snapshot.configuration, preview: snapshot.preview }))
    try {
      const result = await desktop.projectConfigurations.create(project.id, snapshot.configuration)
      setState(() => result.ok
        ? { kind: 'created', result: result.value }
        : { kind: 'previewing', configuration: snapshot.configuration, preview: snapshot.preview, error: result.error })
    } finally {
      createInFlight.current = false
    }
  }

  const stateError = state.kind === 'editing' || state.kind === 'previewing' ? state.error : undefined
  useEffect(() => {
    if (!stateError) return
    ;(controlFor(stateError.fieldPath) ?? alertRef.current)?.focus()
  }, [stateError])

  if (state.kind === 'created') {
    return <main className="app-shell configuration-page"><button type="button" onClick={onBack}>Back to projects</button><ConfigurationSuccess result={state.result} /></main>
  }

  return <main className="app-shell configuration-page">
    <header className="app-header"><div><p className="eyebrow">Project configuration</p><h1>{project.name}</h1></div></header>
    <div className="configuration-layout">
      {state.kind === 'editing' ? <section>
        {state.error ? <section ref={alertRef} tabIndex={-1} className="action-error" role="alert"><strong>{state.error.message}</strong><span>{state.error.nextAction}</span></section> : null}
        <form onSubmit={(event) => { event.preventDefault(); void previewConfiguration() }}>
          <ServiceConfigurationForm service={state.configuration.services[0]!} serviceIndex={0}
            error={state.error} onChange={(service) => editDraft(updateService(state.configuration, 0, service))} />
          <div className="configuration-actions">
            <button type="button" onClick={onBack}>Back to projects</button>
            <button type="submit" className="primary-action">Preview configuration</button>
          </div>
        </form>
      </section> : <ProjectConfigurationPreviewPanel preview={state.preview} creating={state.kind === 'creating'} error={state.kind === 'previewing' ? state.error : undefined} alertRef={alertRef} onBack={() => setState(() => ({ kind: 'editing', configuration: state.configuration }))} onCreate={() => void createConfiguration()} />}
      <aside className="configuration-help"><h2>Portable configuration</h2><p>Paths stay relative to the project root. Put secrets in referenced .env files.</p></aside>
    </div>
  </main>
}
