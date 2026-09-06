import { useRef } from 'react'
import type {
  ActionableError,
  EnvironmentVariableDraft,
  PlatformName,
  PlatformOverrideDraft,
  DevelopmentServiceDraft
} from '../../shared/contracts'

interface ServiceConfigurationFormProps {
  service: DevelopmentServiceDraft
  serviceIndex: number
  error: ActionableError | undefined
  onChange(service: DevelopmentServiceDraft): void
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) => currentIndex === index ? value : current)
}

function removeAt<T>(values: readonly T[], index: number): T[] {
  return values.filter((_, currentIndex) => currentIndex !== index)
}

function FieldIssue({ error, path }: { error: ActionableError | undefined; path: string }) {
  return error?.fieldPath === path ? <span className="field-error" id={`issue-${path}`}>
    <strong>{error.message}</strong>
    <span>{error.nextAction}</span>
  </span> : null
}

function describedBy(error: ActionableError | undefined, path: string): string | undefined {
  return error?.fieldPath === path ? `issue-${path}` : undefined
}

function useRowKeys(length: number, prefix: string): string[] {
  const keys = useRef<string[]>([])
  const nextId = useRef(0)
  while (keys.current.length < length) keys.current.push(`${prefix}-${nextId.current++}`)
  keys.current.length = length
  return keys.current
}

interface StringRowsProps {
  title: string
  itemName: string
  addLabel: string
  idPrefix: string
  pathPrefix: string
  values: readonly string[]
  error: ActionableError | undefined
  onChange(values: string[]): void
}

function StringRows(props: StringRowsProps) {
  const rowKeys = useRowKeys(props.values.length, props.idPrefix)
  return <fieldset>
    <legend>{props.title}</legend>
    {props.values.map((value, index) => {
      const id = `${props.idPrefix}-${index}`
      const path = `${props.pathPrefix}[${index}]`
      return <div className="dynamic-row" key={rowKeys[index]}>
        <label htmlFor={id}>{props.itemName} {index + 1}</label>
        <input id={id} value={value} aria-describedby={describedBy(props.error, path)} onChange={(event) => props.onChange(replaceAt(props.values, index, event.target.value))} />
        <button type="button" aria-label={`Remove ${props.itemName.toLowerCase()} ${index + 1}`} onClick={() => {
          rowKeys.splice(index, 1)
          props.onChange(removeAt(props.values, index))
        }}>Remove</button>
        <FieldIssue error={props.error} path={path} />
      </div>
    })}
    <button type="button" onClick={() => props.onChange([...props.values, ''])}>{props.addLabel}</button>
  </fieldset>
}

interface EnvironmentRowsProps {
  title: string
  labelPrefix: string
  idPrefix: string
  pathPrefix: string
  rows: readonly EnvironmentVariableDraft[]
  error: ActionableError | undefined
  onChange(rows: EnvironmentVariableDraft[]): void
}

function EnvironmentRows(props: EnvironmentRowsProps) {
  const rowKeys = useRowKeys(props.rows.length, props.idPrefix)
  return <fieldset>
    <legend>{props.title}</legend>
    {props.rows.map((row, index) => {
      const keyPath = `${props.pathPrefix}[${index}].key`
      const valuePath = `${props.pathPrefix}[${index}].value`
      return <div className="dynamic-row environment-row" key={rowKeys[index]}>
        <label htmlFor={`${props.idPrefix}-key-${index}`}>{props.labelPrefix}Environment key {index + 1}</label>
        <input id={`${props.idPrefix}-key-${index}`} value={row.key} aria-describedby={describedBy(props.error, keyPath)} onChange={(event) => props.onChange(replaceAt(props.rows, index, { ...row, key: event.target.value }))} />
        <FieldIssue error={props.error} path={keyPath} />
        <label htmlFor={`${props.idPrefix}-value-${index}`}>{props.labelPrefix}Environment value {index + 1}</label>
        <input id={`${props.idPrefix}-value-${index}`} value={row.value} aria-describedby={describedBy(props.error, valuePath)} onChange={(event) => props.onChange(replaceAt(props.rows, index, { ...row, value: event.target.value }))} />
        <FieldIssue error={props.error} path={valuePath} />
        <button type="button" aria-label={`Remove ${props.labelPrefix.toLowerCase()}environment value ${index + 1}`} onClick={() => {
          rowKeys.splice(index, 1)
          props.onChange(removeAt(props.rows, index))
        }}>Remove</button>
      </div>
    })}
    <button type="button" onClick={() => props.onChange([...props.rows, { key: '', value: '' }])}>Add {props.labelPrefix.toLowerCase()}environment value</button>
  </fieldset>
}

function PlatformOverrideEditor(props: {
  platform: PlatformName
  serviceIndex: number
  override: PlatformOverrideDraft | undefined
  error: ActionableError | undefined
  onChange(override: PlatformOverrideDraft | undefined): void
}) {
  const title = props.platform === 'macos' ? 'macOS' : 'Windows'
  const base = `$.services[${props.serviceIndex}].${props.platform}`
  const idPrefix = `service-${props.serviceIndex}-${props.platform}`
  const regionId = `${idPrefix}-overrides`
  return <section className="platform-overrides">
    <button type="button" aria-expanded={props.override !== undefined} aria-controls={regionId} onClick={() => props.onChange(props.override === undefined ? {} : undefined)}>{title} overrides</button>
    {props.override === undefined ? null : <div id={regionId} role="region" aria-label={`${title} overrides`}>
      <label htmlFor={`${idPrefix}-program`}>{title} Program</label>
      <input id={`${idPrefix}-program`} value={props.override.program ?? ''} aria-describedby={describedBy(props.error, `${base}.program`)} onChange={(event) => props.onChange({ ...props.override, program: event.target.value })} />
      <FieldIssue error={props.error} path={`${base}.program`} />
      <StringRows title={`${title} Arguments`} itemName={`${title} Argument`} addLabel={`Add ${title} argument`} idPrefix={`${idPrefix}-argument`} pathPrefix={`${base}.args`} values={props.override.args ?? []} error={props.error} onChange={(args) => props.onChange({ ...props.override, args })} />
      <EnvironmentRows title={`${title} Environment values`} labelPrefix={`${title} `} idPrefix={`${idPrefix}-environment`} pathPrefix={`${base}.env`} rows={props.override.env ?? []} error={props.error} onChange={(env) => props.onChange({ ...props.override, env })} />
    </div>}
  </section>
}

export function ServiceConfigurationForm(props: ServiceConfigurationFormProps) {
  const { service } = props
  const base = `$.services[${props.serviceIndex}]`
  const idPrefix = `service-${props.serviceIndex}`
  const changeService = (patch: Partial<DevelopmentServiceDraft>) => props.onChange({ ...service, ...patch })
  const changePlatform = (platform: PlatformName, override: PlatformOverrideDraft | undefined) => {
    const nextService = { ...service }
    if (override === undefined) delete nextService[platform]
    else nextService[platform] = override
    props.onChange(nextService)
  }

  return <div className="service-configuration-fields">
    <label htmlFor={`${idPrefix}-id`}>Service ID</label>
    <input id={`${idPrefix}-id`} value={service.id} aria-describedby={describedBy(props.error, `${base}.id`)} onChange={(event) => changeService({ id: event.target.value.trim() })} />
    <FieldIssue error={props.error} path={`${base}.id`} />
    <label htmlFor={`${idPrefix}-program`}>Program</label>
    <input id={`${idPrefix}-program`} value={service.program} aria-describedby={describedBy(props.error, `${base}.program`)} onChange={(event) => changeService({ program: event.target.value })} />
    <FieldIssue error={props.error} path={`${base}.program`} />
    <StringRows title="Arguments" itemName="Argument" addLabel="Add argument" idPrefix={`${idPrefix}-argument`} pathPrefix={`${base}.args`} values={service.args} error={props.error} onChange={(args) => changeService({ args })} />
    <label htmlFor={`${idPrefix}-working-directory`}>Working directory</label>
    <input id={`${idPrefix}-working-directory`} value={service.workingDirectory} aria-describedby={describedBy(props.error, `${base}.workingDirectory`)} onChange={(event) => changeService({ workingDirectory: event.target.value })} />
    <p>Use / separators and a path relative to the project root.</p>
    <FieldIssue error={props.error} path={`${base}.workingDirectory`} />
    <EnvironmentRows title="Environment values" labelPrefix="" idPrefix={`${idPrefix}-environment`} pathPrefix={`${base}.env`} rows={service.env} error={props.error} onChange={(env) => changeService({ env })} />
    <p>Only enter non-sensitive values; put secrets in .env files.</p>
    <StringRows title="Environment files" itemName="Environment file" addLabel="Add environment file" idPrefix={`${idPrefix}-env-file`} pathPrefix={`${base}.envFiles`} values={service.envFiles} error={props.error} onChange={(envFiles) => changeService({ envFiles })} />
    <label className="checkbox-field"><input type="checkbox" checked={service.shell} onChange={(event) => changeService({ shell: event.target.checked })} />Run through shell</label>
    <p>Shell execution changes quoting and expansion behavior. Enable it only when required.</p>
    <PlatformOverrideEditor platform="macos" serviceIndex={props.serviceIndex} override={service.macos} error={props.error} onChange={(override) => changePlatform('macos', override)} />
    <PlatformOverrideEditor platform="windows" serviceIndex={props.serviceIndex} override={service.windows} error={props.error} onChange={(override) => changePlatform('windows', override)} />
  </div>
}
