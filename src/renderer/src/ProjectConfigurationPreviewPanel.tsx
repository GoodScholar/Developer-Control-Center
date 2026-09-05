import type { RefObject } from 'react'
import type { ActionableError, ProjectConfigurationPreview } from '../../shared/contracts'

interface PreviewPanelProps {
  preview: ProjectConfigurationPreview
  creating: boolean
  error: ActionableError | undefined
  alertRef: RefObject<HTMLElement | null>
  onBack(): void
  onCreate(): void
}

export function ProjectConfigurationPreviewPanel(props: PreviewPanelProps) {
  return <section aria-labelledby="configuration-preview-heading">
    <h2 id="configuration-preview-heading">Configuration preview</h2>
    {props.error ? <section ref={props.alertRef} tabIndex={-1} className="action-error" role="alert"><strong>{props.error.message}</strong><span>{props.error.nextAction}</span></section> : null}
    <pre tabIndex={0} aria-label="Project configuration preview">{props.preview.source}</pre>
    <div className="configuration-actions">
      <button type="button" onClick={props.onBack} disabled={props.creating}>Back to editing</button>
      <button type="button" className="primary-action" onClick={props.onCreate} disabled={props.creating}>{props.creating ? 'Creating configuration…' : 'Create configuration'}</button>
    </div>
  </section>
}
