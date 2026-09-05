import type { ProjectConfigurationCreated } from '../../shared/contracts'

export function ConfigurationSuccess({ result }: { result: ProjectConfigurationCreated }) {
  return <section className="configuration-success" aria-live="polite">
    <h2>{result.relativePath} created</h2>
    <p>Created at the project root.</p>
  </section>
}
