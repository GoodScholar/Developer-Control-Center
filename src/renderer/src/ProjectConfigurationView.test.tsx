import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi, ProjectSnapshot } from '../../shared/contracts'
import { ProjectConfigurationView } from './ProjectConfigurationView'

const project = {
  id: 'project-1',
  name: 'sample-project',
  rootPath: '/projects/sample-project',
  availability: 'available'
} satisfies Extract<ProjectSnapshot, { availability: 'available' }>
const preview = vi.fn<DesktopApi['projectConfigurations']['preview']>()
const create = vi.fn<DesktopApi['projectConfigurations']['create']>()
const desktop: DesktopApi = {
  projects: {
    list: async () => ({ ok: true, value: [project] }),
    add: async () => ({ ok: true, value: null }),
    remove: async () => ({ ok: true, value: null })
  },
  projectConfigurations: { preview, create }
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

test('previews the structured draft, invalidates it after editing, then creates once', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'schema_version = 1\n[services.web]\nprogram = "pnpm"\n' } })
  create.mockResolvedValue({ ok: true, value: { relativePath: '.devcontrol.toml' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Add argument' }))
  await user.type(screen.getByLabelText('Argument 1'), 'dev')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview).toHaveBeenCalledWith('project-1', expect.objectContaining({
    service: expect.objectContaining({
      id: 'web', program: 'pnpm', args: ['dev'], workingDirectory: '.', shell: false, envFiles: [], env: []
    })
  }))
  expect(screen.getByText(/schema_version = 1/)).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Back to editing' }))
  await user.clear(screen.getByLabelText('Working directory'))
  await user.type(screen.getByLabelText('Working directory'), 'apps/web')
  expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  await user.click(screen.getByRole('button', { name: 'Create configuration' }))

  expect(create).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('.devcontrol.toml created')).toBeVisible()
})

test('ignores a stale preview response after the draft changes', async () => {
  let resolveFirst!: (value: Awaited<ReturnType<typeof preview>>) => void
  preview.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
  preview.mockResolvedValueOnce({ ok: true, value: { source: 'new preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  await user.clear(screen.getByLabelText('Program'))
  await user.type(screen.getByLabelText('Program'), 'npm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(await screen.findByText('new preview')).toBeVisible()
  await act(async () => resolveFirst({ ok: true, value: { source: 'stale preview' } }))
  expect(screen.getByText('new preview')).toBeVisible()
  expect(screen.queryByText('stale preview')).not.toBeInTheDocument()
})

test('submits shell only after selection and omits disabled platform overrides', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  expect(screen.getByLabelText('Run through shell')).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'macOS overrides' })).toHaveAttribute('aria-expanded', 'false')
  await user.click(screen.getByLabelText('Run through shell'))
  await user.click(screen.getByRole('button', { name: 'macOS overrides' }))
  await user.type(screen.getByLabelText('macOS Program'), 'node')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview).toHaveBeenCalledWith('project-1', expect.objectContaining({
    service: expect.objectContaining({ shell: true, macos: { program: 'node' } })
  }))
  expect(preview.mock.calls[0]![1].service.windows).toBeUndefined()
})

test('submits Windows program, argument and environment overrides only', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Windows overrides' }))
  await user.type(screen.getByLabelText('Windows Program'), 'pnpm.cmd')
  await user.click(screen.getByRole('button', { name: 'Add Windows argument' }))
  await user.type(screen.getByLabelText('Windows Argument 1'), 'dev')
  await user.click(screen.getByRole('button', { name: 'Add windows environment value' }))
  await user.type(screen.getByLabelText('Windows Environment key 1'), 'WATCH_MODE')
  await user.type(screen.getByLabelText('Windows Environment value 1'), 'poll')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview.mock.calls[0]![1].service.windows).toEqual({
    program: 'pnpm.cmd',
    args: ['dev'],
    env: [{ key: 'WATCH_MODE', value: 'poll' }]
  })
})

test.each([
  ['Add argument', 'Argument 1', 'dev', 'Remove argument 1', 'args'],
  ['Add environment file', 'Environment file 1', '.env', 'Remove environment file 1', 'envFiles']
] as const)('adds and removes a %s row without retaining stale data', async (
  addName, inputName, value, removeName, field
) => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: addName }))
  await user.type(screen.getByLabelText(inputName), value)
  await user.click(screen.getByRole('button', { name: removeName }))
  expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview.mock.calls[0]![1].service[field]).toEqual([])
})

test('adds and removes an environment row without retaining its value', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Add environment value' }))
  await user.type(screen.getByLabelText('Environment key 1'), 'PORT')
  await user.type(screen.getByLabelText('Environment value 1'), '3000')
  await user.click(screen.getByRole('button', { name: 'Remove environment value 1' }))
  expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview.mock.calls[0]![1].service.env).toEqual([])
})

test('prevents duplicate create calls while the first request is pending', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  let resolveCreate!: (value: Awaited<ReturnType<typeof create>>) => void
  create.mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  const createButton = screen.getByRole('button', { name: 'Create configuration' })
  await user.dblClick(createButton)

  expect(create).toHaveBeenCalledTimes(1)
  expect(createButton).toBeDisabled()
  resolveCreate({ ok: true, value: { relativePath: '.devcontrol.toml' } })
  expect(await screen.findByText('.devcontrol.toml created')).toBeVisible()
})

test('focuses a mapped field error without rendering the environment value', async () => {
  const secretValue = 'renderer-secret-mutation-7124'
  preview.mockResolvedValue({
    ok: false,
    error: {
      code: 'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
      resource: { kind: 'project_configuration', projectId: 'project-1' },
      fieldPath: '$.service.env[1].key',
      message: 'The environment variable name is duplicated.',
      nextAction: 'Keep one row for this environment variable.'
    }
  })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Add environment value' }))
  await user.click(screen.getByRole('button', { name: 'Add environment value' }))
  await user.type(screen.getByLabelText('Environment key 2'), 'SAFE_KEY')
  await user.type(screen.getByLabelText('Environment value 2'), secretValue)
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(document.activeElement).toBe(screen.getByLabelText('Environment key 2'))
  expect(screen.getByRole('alert')).not.toHaveTextContent(secretValue)
})

test('renders a field error message and next action, then focuses its control', async () => {
  preview.mockResolvedValue({
    ok: false,
    error: {
      code: 'CONFIG_PROGRAM_REQUIRED',
      resource: { kind: 'project_configuration', projectId: 'project-1' },
      fieldPath: '$.service.program',
      message: 'A program is required.',
      nextAction: 'Enter the program to run.'
    }
  })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('A program is required.')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the program to run.')
  expect(document.activeElement).toBe(screen.getByLabelText('Program'))
})

test.each([
  '$.service.args[2]',
  '$.service.macos.program'
])('falls back to a focused page alert when %s has no rendered control', async (fieldPath) => {
  preview.mockResolvedValue({
    ok: false,
    error: {
      code: 'CONFIG_FIELD_TYPE_INVALID',
      resource: { kind: 'project_configuration', projectId: 'project-1' },
      fieldPath,
      message: 'The configuration field is unavailable.',
      nextAction: 'Review the configured fields and try again.'
    }
  })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  const pageAlert = await screen.findByRole('alert')
  expect(pageAlert).toHaveTextContent('The configuration field is unavailable.')
  expect(pageAlert).toHaveTextContent('Review the configured fields and try again.')
  expect(document.activeElement).toBe(pageAlert)
})

test.each([
  ['CONFIG_UNKNOWN_FIELD', '$.service.unknown', 'project_configuration'],
  ['PROJECT_NOT_FOUND', undefined, 'project'],
  ['PROJECT_DIRECTORY_UNAVAILABLE', undefined, 'project'],
  ['PROJECT_CONFIGURATION_ALREADY_EXISTS', undefined, 'project_configuration']
] as const)('focuses the page alert for %s', async (code, fieldPath, kind) => {
  preview.mockResolvedValue({
    ok: false,
    error: {
      code,
      resource: kind === 'project'
        ? { kind: 'project', id: 'project-1' }
        : { kind: 'project_configuration', projectId: 'project-1' },
      ...(fieldPath === undefined ? {} : { fieldPath }),
      message: 'The configuration action failed.',
      nextAction: 'Review the project and try again.'
    }
  })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)

  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(document.activeElement).toBe(await screen.findByRole('alert'))
})
