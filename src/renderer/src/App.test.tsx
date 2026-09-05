import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import type { ActionableError, DesktopApi, ProjectSnapshot } from '../../shared/contracts'
import { App } from './App'

afterEach(cleanup)

function createDesktopApi(
  project: ProjectSnapshot,
  initialProjects: ProjectSnapshot[] = []
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
    }
  }
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
