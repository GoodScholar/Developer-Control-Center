import { useEffect, useRef, useState } from 'react'
import type { ActionableError, DesktopApi, ProjectConfigurationCreated, ProjectConfigurationDraft, ProjectConfigurationPreview, ProjectSnapshot } from '../../shared/contracts'
import { ConfigurationSuccess } from './ConfigurationSuccess'
import { ProjectConfigurationPreviewPanel } from './ProjectConfigurationPreviewPanel'
import { ServiceConfigurationForm } from './ServiceConfigurationForm'

type ConfigurationWorkflowState =
  | { kind: 'editing'; draft: ProjectConfigurationDraft; error?: ActionableError }
  | { kind: 'previewing'; draft: ProjectConfigurationDraft; preview: ProjectConfigurationPreview; error?: ActionableError }
  | { kind: 'creating'; draft: ProjectConfigurationDraft; preview: ProjectConfigurationPreview }
  | { kind: 'created'; result: ProjectConfigurationCreated }

interface ProjectConfigurationViewProps {
  desktop: DesktopApi
  project: Extract<ProjectSnapshot, { availability: 'available' }>
  onBack(): void
}

const initialDraft: ProjectConfigurationDraft = {
  service: { id: 'web', program: '', args: [], workingDirectory: '.', shell: false, envFiles: [], env: [] }
}

function controlIdFor(fieldPath: string | undefined): string | undefined {
  if (fieldPath === '$.service.id') return 'service-id'
  if (fieldPath === '$.service.program') return 'program'
  if (fieldPath === '$.service.workingDirectory') return 'working-directory'
  const indexed = fieldPath?.match(/^\$\.service\.(args|envFiles|env)\[(\d+)](?:\.(key|value))?$/)
  if (indexed) {
    const index = indexed[2]
    if (indexed[1] === 'args') return `argument-${index}`
    if (indexed[1] === 'envFiles') return `env-file-${index}`
    return `environment-${indexed[3]}-${index}`
  }
  const platform = fieldPath?.match(/^\$\.service\.(macos|windows)\.(program|args|env)(?:\[(\d+)])?(?:\.(key|value))?$/)
  if (!platform) return undefined
  if (platform[2] === 'program') return `${platform[1]}-program`
  if (platform[2] === 'args') return `${platform[1]}-argument-${platform[3]}`
  return `${platform[1]}-environment-${platform[4]}-${platform[3]}`
}

function controlFor(fieldPath: string | undefined): HTMLElement | null {
  const controlId = controlIdFor(fieldPath)
  return controlId === undefined || typeof document === 'undefined' ? null : document.getElementById(controlId)
}

export function ProjectConfigurationView({ desktop, project, onBack }: ProjectConfigurationViewProps) {
  const [state, setState] = useState<ConfigurationWorkflowState>(() => ({ kind: 'editing', draft: structuredClone(initialDraft) }))
  const previewSequence = useRef(0)
  const createInFlight = useRef(false)
  const alertRef = useRef<HTMLElement>(null)

  function editDraft(nextDraft: ProjectConfigurationDraft): void {
    previewSequence.current += 1
    setState(() => ({ kind: 'editing', draft: nextDraft }))
  }

  async function previewConfiguration() {
    if (state.kind !== 'editing') return
    const sequence = ++previewSequence.current
    const draftSnapshot = structuredClone(state.draft)
    const result = await desktop.projectConfigurations.preview(project.id, draftSnapshot)
    if (sequence !== previewSequence.current) return
    setState(() => result.ok
      ? { kind: 'previewing', draft: draftSnapshot, preview: result.value }
      : { kind: 'editing', draft: draftSnapshot, error: result.error })
  }

  async function createConfiguration() {
    if (state.kind !== 'previewing' || createInFlight.current) return
    createInFlight.current = true
    const snapshot = state
    setState(() => ({ kind: 'creating', draft: snapshot.draft, preview: snapshot.preview }))
    try {
      const result = await desktop.projectConfigurations.create(project.id, snapshot.draft)
      setState(() => result.ok
        ? { kind: 'created', result: result.value }
        : { kind: 'previewing', draft: snapshot.draft, preview: snapshot.preview, error: result.error })
    } finally {
      createInFlight.current = false
    }
  }

  const stateError = state.kind === 'editing' || state.kind === 'previewing' ? state.error : undefined
  const errorControl = stateError ? controlFor(stateError.fieldPath) : null
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
        {state.error && !errorControl ? <section ref={alertRef} tabIndex={-1} className="action-error" role="alert"><strong>{state.error.message}</strong><span>{state.error.nextAction}</span></section> : null}
        <ServiceConfigurationForm draft={state.draft} error={state.error} onChange={editDraft} onPreview={() => void previewConfiguration()} onBack={onBack} />
      </section> : <ProjectConfigurationPreviewPanel preview={state.preview} creating={state.kind === 'creating'} error={state.kind === 'previewing' ? state.error : undefined} alertRef={alertRef} onBack={() => setState(() => ({ kind: 'editing', draft: state.draft }))} onCreate={() => void createConfiguration()} />}
      <aside className="configuration-help"><h2>Portable configuration</h2><p>Paths stay relative to the project root. Put secrets in referenced .env files.</p></aside>
    </div>
  </main>
}
