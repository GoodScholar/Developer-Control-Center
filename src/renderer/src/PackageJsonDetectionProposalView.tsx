import { useEffect, useRef, useState } from 'react'
import type {
  ActionableError,
  DesktopApi,
  DevelopmentServiceDraft,
  PackageJsonDetectionCandidate,
  PackageJsonDetectionProposal,
  ProjectConfigurationCreated,
  ProjectConfigurationPreview,
  ProjectSnapshot
} from '../../shared/contracts'
import { ConfigurationSuccess } from './ConfigurationSuccess'
import { controlIdForConfigurationField } from './configuration-field-focus'
import { ProjectConfigurationPreviewPanel } from './ProjectConfigurationPreviewPanel'
import { ServiceConfigurationForm } from './ServiceConfigurationForm'

type ProposalState =
  | { kind: 'editing'; candidates: PackageJsonDetectionCandidate[]; error?: ActionableError }
  | { kind: 'previewing'; candidates: PackageJsonDetectionCandidate[]; preview: ProjectConfigurationPreview; error?: ActionableError }
  | { kind: 'creating'; candidates: PackageJsonDetectionCandidate[]; preview: ProjectConfigurationPreview }
  | { kind: 'created'; result: ProjectConfigurationCreated }

interface PackageJsonDetectionProposalViewProps {
  desktop: DesktopApi
  project: Extract<ProjectSnapshot, { availability: 'available' }>
  proposal: PackageJsonDetectionProposal
  onReject(): void
  onBack(): void
}

function proposalControlFor(fieldPath: string | undefined): HTMLElement | null {
  const controlId = controlIdForConfigurationField(fieldPath)
  return controlId === undefined || typeof document === 'undefined' ? null : document.getElementById(controlId)
}

function draftFor(candidates: PackageJsonDetectionCandidate[]) {
  return { services: candidates.map((candidate) => candidate.draft) }
}

export function PackageJsonDetectionProposalView({
  desktop,
  project,
  proposal,
  onReject,
  onBack
}: PackageJsonDetectionProposalViewProps) {
  const [state, setState] = useState<ProposalState>(() => ({
    kind: 'editing',
    candidates: structuredClone(proposal.candidates)
  }))
  const previewSequence = useRef(0)
  const createInFlight = useRef(false)
  const alertRef = useRef<HTMLElement>(null)
  const stateError = state.kind === 'editing' || state.kind === 'previewing' ? state.error : undefined

  useEffect(() => {
    if (!stateError) return
    ;(proposalControlFor(stateError.fieldPath) ?? alertRef.current)?.focus()
  }, [stateError])

  function editCandidates(update: (candidates: PackageJsonDetectionCandidate[]) => PackageJsonDetectionCandidate[]): void {
    previewSequence.current += 1
    setState((current) => current.kind === 'created'
      ? current
      : { kind: 'editing', candidates: update(current.candidates) })
  }

  function editCandidate(candidateId: string, draft: DevelopmentServiceDraft): void {
    editCandidates((candidates) => candidates.map((candidate) =>
      candidate.candidateId === candidateId ? { ...candidate, draft } : candidate
    ))
  }

  function removeCandidate(candidateId: string): void {
    editCandidates((candidates) => candidates.filter((candidate) => candidate.candidateId !== candidateId))
  }

  async function previewConfiguration(): Promise<void> {
    if (state.kind !== 'editing') return
    const sequence = ++previewSequence.current
    const candidates = structuredClone(state.candidates)
    const result = await desktop.projectConfigurations.preview(project.id, draftFor(candidates))
    if (sequence !== previewSequence.current) return
    setState(() => result.ok
      ? { kind: 'previewing', candidates, preview: result.value }
      : { kind: 'editing', candidates, error: result.error })
  }

  async function createConfiguration(): Promise<void> {
    if (state.kind !== 'previewing' || createInFlight.current) return
    createInFlight.current = true
    const snapshot = state
    setState(() => ({ kind: 'creating', candidates: snapshot.candidates, preview: snapshot.preview }))
    try {
      const result = await desktop.projectConfigurations.create(project.id, draftFor(snapshot.candidates))
      setState(() => result.ok
        ? { kind: 'created', result: result.value }
        : { ...snapshot, error: result.error })
    } finally {
      createInFlight.current = false
    }
  }

  if (state.kind === 'created') {
    return <main className="app-shell configuration-page proposal-page">
      <button type="button" onClick={onBack}>Back to projects</button>
      <ConfigurationSuccess result={state.result} />
    </main>
  }

  return <main className="app-shell configuration-page proposal-page">
    <header className="app-header">
      <div><h1>Review detected services</h1><p>{project.name}</p></div>
    </header>
    {state.kind === 'editing' ? <section>
      {state.error ? <section ref={alertRef} tabIndex={-1} className="action-error" role="alert"><strong>{state.error.message}</strong><span>{state.error.nextAction}</span></section> : null}
      <form onSubmit={(event) => { event.preventDefault(); void previewConfiguration() }}>
        <div className="proposal-list">
          {state.candidates.map((candidate, index) => <article key={candidate.candidateId}
            data-testid={`candidate-${candidate.candidateId}`} className="proposal-candidate">
            <header>
              <div><h2>Suggested service {candidate.evidence.scriptName}</h2><p>{candidate.evidence.relativePath} → scripts.{candidate.evidence.scriptName}</p></div>
              <button type="button" aria-label={`Remove suggested service ${candidate.evidence.scriptName}`}
                onClick={() => removeCandidate(candidate.candidateId)}>Remove suggestion</button>
            </header>
            <ServiceConfigurationForm service={candidate.draft} serviceIndex={index}
              error={state.error} onChange={(draft) => editCandidate(candidate.candidateId, draft)} />
          </article>)}
        </div>
        <div className="configuration-actions">
          <button type="button" onClick={onReject}>Reject suggestions</button>
          <button type="submit" className="primary-action">Preview configuration</button>
        </div>
      </form>
    </section> : <ProjectConfigurationPreviewPanel preview={state.preview} creating={state.kind === 'creating'}
      error={state.kind === 'previewing' ? state.error : undefined} alertRef={alertRef}
      onBack={() => setState((current) => current.kind === 'previewing'
        ? { kind: 'editing', candidates: current.candidates }
        : current)}
      onCreate={() => void createConfiguration()} />}
  </main>
}
