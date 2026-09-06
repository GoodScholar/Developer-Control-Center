import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { ActionableError, DesktopApi, PackageJsonDetectionProposal, ProjectSnapshot } from '../../shared/contracts'
import { App } from './App'

afterEach(cleanup)

function createDesktopApi(
  project: ProjectSnapshot,
  initialProjects: ProjectSnapshot[] = [],
  detect: DesktopApi['detectionProposals']['detect'] = async () => ({
    ok: true, value: { kind: 'none', reason: 'no-candidates' }
  })
): DesktopApi {
  let projects = initialProjects
  return {
    projects: {
      list: async () => ({ ok: true, value: projects }),
      add: async () => {
        projects = [project]
        return { ok: true, value: project }
      },
      remove: async () => {
        projects = []
        return { ok: true, value: null }
      }
    },
    projectConfigurations: {
      preview: async () => ({ ok: true, value: { source: 'schema_version = 1\n' } }),
      create: async () => ({ ok: true, value: { relativePath: '.devcontrol.toml' } })
    },
    detectionProposals: { detect }
  }
}

const project: Extract<ProjectSnapshot, { availability: 'available' }> = {
  id: 'project-1',
  name: 'sample-project',
  rootPath: '/projects/sample-project',
  availability: 'available'
}

const proposal: PackageJsonDetectionProposal = {
  projectId: project.id,
  candidates: [{
    candidateId: 'package-json:0:dev',
    evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'dev' },
    draft: { id: 'dev', program: 'pnpm', args: ['run', 'dev'], workingDirectory: '.', shell: false, envFiles: [], env: [] }
  }]
}

const detectionError: ActionableError = {
  code: 'PACKAGE_JSON_INVALID',
  resource: { kind: 'project_configuration', projectId: project.id },
  message: 'The package manifest could not be read.',
  nextAction: 'Configure the project manually.'
}

test('adds and removes a selected project', async () => {
  const user = userEvent.setup()
  const desktop = createDesktopApi({
    id: 'project-1',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'available'
  })

  render(<App desktop={desktop} />)

  await user.click(screen.getByRole('button', { name: 'Add project' }))
  expect(await screen.findByText('sample-project')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Remove sample-project' }))
  await waitFor(() => expect(screen.queryByText('sample-project')).not.toBeInTheDocument())
})

test('explains a missing project directory and the next action', async () => {
  const missingProject: ProjectSnapshot = {
    id: 'project-1',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'missing',
    problem: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      resource: { kind: 'project', id: 'project-1' },
      message: 'The project directory is unavailable: /projects/sample-project',
      nextAction: 'Reconnect the drive or choose an accessible project directory.'
    }
  }

  render(<App desktop={createDesktopApi(missingProject, [missingProject])} />)

  expect(await screen.findByText(missingProject.problem.message)).toBeVisible()
  expect(screen.getByText(missingProject.problem.nextAction)).toBeVisible()
})

test('keeps the project list when an action fails and explains recovery', async () => {
  const project: ProjectSnapshot = {
    id: 'project-1',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'available'
  }
  const error: ActionableError = {
    code: 'UNEXPECTED_ERROR',
    resource: { kind: 'project' },
    message: 'The project action could not be completed.',
    nextAction: 'Try again.'
  }
  const desktop: DesktopApi = {
    projects: {
      list: async () => ({ ok: true, value: [project] }),
      add: async () => ({ ok: false, error }),
      remove: async () => ({ ok: false, error })
    },
    projectConfigurations: {
      preview: async () => ({ ok: true, value: { source: 'schema_version = 1\n' } }),
      create: async () => ({ ok: true, value: { relativePath: '.devcontrol.toml' } })
    },
    detectionProposals: {
      detect: async () => ({ ok: true, value: { kind: 'none', reason: 'no-candidates' } })
    }
  }
  const user = userEvent.setup()

  render(<App desktop={desktop} />)

  expect(await screen.findByText('sample-project')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Remove sample-project' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
  expect(screen.getByRole('alert')).toHaveTextContent(error.nextAction)
  expect(screen.getByText('sample-project')).toBeVisible()
})

test('offers configuration only for an available project', async () => {
  const availableProject: ProjectSnapshot = {
    id: 'project-available',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'available'
  }
  const missingProject: ProjectSnapshot = {
    id: 'project-missing',
    name: 'missing-project',
    rootPath: '/projects/missing-project',
    availability: 'missing',
    problem: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      resource: { kind: 'project', id: 'project-missing' },
      message: 'The project directory is unavailable.',
      nextAction: 'Reconnect the drive and try again.'
    }
  }

  render(<App desktop={createDesktopApi(availableProject, [availableProject, missingProject])} />)

  expect(await screen.findByRole('button', { name: 'Configure sample-project' })).toBeVisible()
  expect(screen.queryByRole('button', { name: `Configure ${missingProject.name}` })).not.toBeInTheDocument()
})

test('detects immediately after registration and opens the proposal', async () => {
  let resolveDetect!: (value: Awaited<ReturnType<DesktopApi['detectionProposals']['detect']>>) => void
  const detect = vi.fn<DesktopApi['detectionProposals']['detect']>()
    .mockReturnValue(new Promise((resolve) => { resolveDetect = resolve }))
  const user = userEvent.setup()

  render(<App desktop={createDesktopApi(project, [], detect)} />)

  await user.click(screen.getByRole('button', { name: 'Add project' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Detecting project configuration…')
  expect(detect).toHaveBeenCalledWith(project.id)
  resolveDetect({ ok: true, value: { kind: 'proposal', proposal } })
  expect(await screen.findByRole('heading', { name: 'Review detected services' })).toBeVisible()
})

test.each(['configuration-exists', 'package-json-missing', 'no-candidates'] as const)(
  'returns to the registered project list for %s', async (reason) => {
    const detect = vi.fn().mockResolvedValue({ ok: true, value: { kind: 'none', reason } })
    const user = userEvent.setup()
    render(<App desktop={createDesktopApi(project, [], detect)} />)

    await user.click(screen.getByRole('button', { name: 'Add project' }))
    expect(await screen.findByRole('heading', { name: project.name })).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  }
)

test('keeps registration and offers manual configuration after detection failure', async () => {
  const detect = vi.fn().mockResolvedValue({ ok: false, error: detectionError })
  const user = userEvent.setup()
  render(<App desktop={createDesktopApi(project, [], detect)} />)

  await user.click(screen.getByRole('button', { name: 'Add project' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(detectionError.message)
  expect(document.activeElement).toBe(alert)
  expect(screen.getByRole('heading', { name: project.name })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Configure manually' }))
  expect(await screen.findByText('Project configuration')).toBeVisible()
  expect(screen.getAllByLabelText('Service ID')).toHaveLength(1)
  expect(detect).toHaveBeenCalledTimes(1)
})

test('returns to the list when proposal is rejected without detecting again', async () => {
  const detect = vi.fn().mockResolvedValue({ ok: true, value: { kind: 'proposal', proposal } })
  const user = userEvent.setup()
  render(<App desktop={createDesktopApi(project, [], detect)} />)

  await user.click(screen.getByRole('button', { name: 'Add project' }))
  await user.click(await screen.findByRole('button', { name: 'Reject suggestions' }))
  expect(await screen.findByRole('heading', { name: project.name })).toBeVisible()
  expect(detect).toHaveBeenCalledTimes(1)
})

test('ignores detection completion after leaving the detecting view', async () => {
  let resolveDetect!: (value: Awaited<ReturnType<DesktopApi['detectionProposals']['detect']>>) => void
  const detect = vi.fn<DesktopApi['detectionProposals']['detect']>()
    .mockReturnValue(new Promise((resolve) => { resolveDetect = resolve }))
  const user = userEvent.setup()
  render(<App desktop={createDesktopApi(project, [], detect)} />)

  await user.click(screen.getByRole('button', { name: 'Add project' }))
  await user.click(screen.getByRole('button', { name: 'Back to projects' }))
  resolveDetect({ ok: true, value: { kind: 'proposal', proposal } })
  expect(await screen.findByRole('heading', { name: project.name })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Review detected services' })).not.toBeInTheDocument()
})
