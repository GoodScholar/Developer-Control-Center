import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi, PackageJsonDetectionProposal, ProjectSnapshot } from '../../shared/contracts'
import { PackageJsonDetectionProposalView } from './PackageJsonDetectionProposalView'

const project = {
  id: 'project-1',
  name: 'sample-project',
  rootPath: '/projects/sample-project',
  availability: 'available'
} satisfies Extract<ProjectSnapshot, { availability: 'available' }>

const proposal: PackageJsonDetectionProposal = {
  projectId: project.id,
  candidates: [
    {
      candidateId: 'package-json:0:dev',
      evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'dev' },
      draft: { id: 'dev', program: 'npm', args: ['run', 'dev'], workingDirectory: '.', shell: false, envFiles: [], env: [] }
    },
    {
      candidateId: 'package-json:1:dev:api',
      evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'dev:api' },
      draft: { id: 'dev-api', program: 'npm', args: ['run', 'dev:api'], workingDirectory: '.', shell: false, envFiles: [], env: [] }
    },
    {
      candidateId: 'package-json:2:watch',
      evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'watch' },
      draft: { id: 'watch', program: 'npm', args: ['run', 'watch'], workingDirectory: '.', shell: false, envFiles: [], env: [] }
    }
  ]
}

const preview = vi.fn<DesktopApi['projectConfigurations']['preview']>()
const create = vi.fn<DesktopApi['projectConfigurations']['create']>()
const detect = vi.fn<DesktopApi['detectionProposals']['detect']>()
const onReject = vi.fn()
const onBack = vi.fn()
const desktop: DesktopApi = {
  projects: {
    list: async () => ({ ok: true, value: [project] }),
    add: async () => ({ ok: true, value: null }),
    remove: async () => ({ ok: true, value: null })
  },
  projectConfigurations: { preview, create },
  detectionProposals: { detect }
}

function renderView() {
  return render(<PackageJsonDetectionProposalView desktop={desktop} project={project}
    proposal={proposal} onReject={onReject} onBack={onBack} />)
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

test('shows source evidence and keeps it attached after editing the service id', async () => {
  const user = userEvent.setup()
  renderView()

  const devCard = screen.getByTestId('candidate-package-json:0:dev')
  expect(within(devCard).getByText('package.json → scripts.dev')).toBeVisible()
  expect(within(devCard).getByLabelText('Program')).toHaveValue('npm')
  expect(within(devCard).getByLabelText('Argument 1')).toHaveValue('run')
  expect(within(devCard).getByLabelText('Argument 2')).toHaveValue('dev')
  expect(within(devCard).getByLabelText('Working directory')).toHaveValue('.')

  await user.clear(within(devCard).getByLabelText('Service ID'))
  await user.type(within(devCard).getByLabelText('Service ID'), 'frontend')

  expect(within(devCard).getByText('package.json → scripts.dev')).toBeVisible()
})

test('removes one candidate, previews edited remaining services and invalidates the preview', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'multi-service-preview' } })
  const user = userEvent.setup()
  renderView()

  await user.click(screen.getByRole('button', { name: 'Remove suggested service dev:api' }))
  const watchCard = screen.getByTestId('candidate-package-json:2:watch')
  await user.clear(within(watchCard).getByLabelText('Working directory'))
  await user.type(within(watchCard).getByLabelText('Working directory'), 'apps/web')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview).toHaveBeenCalledWith('project-1', {
    services: [
      expect.objectContaining({ id: 'dev' }),
      expect.objectContaining({ id: 'watch', workingDirectory: 'apps/web' })
    ]
  })

  await user.click(screen.getByRole('button', { name: 'Back to editing' }))
  const editedWatchCard = screen.getByTestId('candidate-package-json:2:watch')
  await user.type(within(editedWatchCard).getByLabelText('Program'), '-changed')
  expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument()
})

test('rejects locally without previewing, creating or persisting a proposal', async () => {
  const user = userEvent.setup()
  renderView()

  await user.click(screen.getByRole('button', { name: 'Reject suggestions' }))

  expect(onReject).toHaveBeenCalledOnce()
  expect(preview).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
  expect(detect).not.toHaveBeenCalled()
})

test('submits an empty services array to the shared validation boundary', async () => {
  preview.mockResolvedValue({ ok: false, error: {
    code: 'CONFIG_SERVICES_REQUIRED', resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath: '$.services', message: 'At least one service is required.', nextAction: 'Keep or add at least one service.'
  } })
  const user = userEvent.setup()
  renderView()

  for (const name of ['dev', 'dev:api', 'watch']) {
    await user.click(screen.getByRole('button', { name: `Remove suggested service ${name}` }))
  }
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(preview).toHaveBeenCalledWith('project-1', { services: [] })
  expect(await screen.findByRole('alert')).toHaveTextContent('At least one service is required.')
})

test('ignores an older preview and prevents duplicate creation', async () => {
  let resolveFirst!: (value: Awaited<ReturnType<typeof preview>>) => void
  preview.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
  preview.mockResolvedValueOnce({ ok: true, value: { source: 'new preview' } })
  let resolveCreate!: (value: Awaited<ReturnType<typeof create>>) => void
  create.mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
  const user = userEvent.setup()
  renderView()

  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  const firstProgram = within(screen.getByTestId('candidate-package-json:0:dev')).getByLabelText('Program')
  await user.type(firstProgram, '-new')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))

  expect(await screen.findByText('new preview')).toBeVisible()
  await act(async () => resolveFirst({ ok: true, value: { source: 'old preview' } }))
  expect(screen.queryByText('old preview')).not.toBeInTheDocument()
  const createButton = screen.getByRole('button', { name: 'Create configuration' })
  await user.dblClick(createButton)
  expect(create).toHaveBeenCalledTimes(1)
  expect(createButton).toBeDisabled()
  await act(async () => resolveCreate({ ok: true, value: { relativePath: '.devcontrol.toml' } }))
  expect(await screen.findByText('.devcontrol.toml created')).toBeVisible()
})

test('focuses an indexed service error and keeps a create failure in preview', async () => {
  preview.mockResolvedValue({ ok: false, error: {
    code: 'CONFIG_PROGRAM_REQUIRED', resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath: '$.services[1].program', message: 'A program is required.', nextAction: 'Enter a program.'
  } })
  const user = userEvent.setup()
  renderView()

  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(document.activeElement).toBe(within(screen.getByTestId('candidate-package-json:1:dev:api')).getByLabelText('Program'))

  preview.mockResolvedValueOnce({ ok: true, value: { source: 'preview source' } })
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  create.mockResolvedValueOnce({ ok: false, error: {
    code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS', resource: { kind: 'project_configuration', projectId: 'project-1' },
    message: 'The project configuration already exists and was not changed.', nextAction: 'Open it externally.'
  } })
  await user.click(screen.getByRole('button', { name: 'Create configuration' }))

  expect(document.activeElement).toBe(await screen.findByRole('alert'))
  expect(screen.getByText('preview source')).toBeVisible()
})

test.each([
  {
    fieldPath: '$.services[1].env[0].key',
    code: 'CONFIG_ENVIRONMENT_KEY_INVALID',
    patch: { env: [{ key: 'PORT', value: '' }] },
    label: 'Environment key 1'
  },
  {
    fieldPath: '$.services[1].macos.program',
    code: 'CONFIG_PROGRAM_REQUIRED',
    patch: { macos: { program: '', args: [], env: [] } },
    label: 'macOS Program'
  }
] as const)('focuses $fieldPath in the proposal form', async ({ fieldPath, code, patch, label }) => {
  preview.mockResolvedValue({ ok: false, error: {
    code, resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath, message: 'Fix this field.', nextAction: 'Correct the highlighted field.'
  } })
  const withIndexedField = structuredClone(proposal)
  Object.assign(withIndexedField.candidates[1]!.draft, patch)
  const user = userEvent.setup()
  render(<PackageJsonDetectionProposalView desktop={desktop} project={project}
    proposal={withIndexedField} onReject={onReject} onBack={onBack} />)

  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(document.activeElement).toBe(within(screen.getByTestId('candidate-package-json:1:dev:api')).getByLabelText(label))
})

test('falls back to the alert only when the field is unknown or not rendered', async () => {
  preview.mockResolvedValue({ ok: false, error: {
    code: 'CONFIG_PROGRAM_REQUIRED', resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath: '$.services[7].program', message: 'Fix this field.', nextAction: 'Correct the highlighted field.'
  } })
  const user = userEvent.setup()
  renderView()

  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(document.activeElement).toBe(await screen.findByRole('alert'))
})
