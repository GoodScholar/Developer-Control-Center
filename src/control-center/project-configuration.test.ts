import { expect, test } from 'vitest'
import type { ProjectConfigurationDraft } from '../shared/contracts'
import { buildProjectConfigurationPreview } from './project-configuration'

const minimalDraft: ProjectConfigurationDraft = {
  service: {
    id: 'web',
    program: '  pnpm  ',
    args: [],
    workingDirectory: '.',
    shell: false,
    envFiles: [],
    env: []
  }
}

test('builds a deterministic schema v1 preview with explicit safe defaults', () => {
  const first = buildProjectConfigurationPreview(minimalDraft)
  const second = buildProjectConfigurationPreview(minimalDraft)
  expect(first).toEqual(second)
  expect(first.source).toMatch(/^schema_version = 1\n/)
  expect(first.source).toContain('[services.web]')
  expect(first.source).toContain('program = "pnpm"')
  expect(first.source).toContain('args = []')
  expect(first.source).toContain('working_directory = "."')
  expect(first.source).toContain('shell = false')
  expect(first.source).toContain('env_files = []')
  expect(first.source.endsWith('\n')).toBe(true)
  expect(first.source.endsWith('\n\n')).toBe(false)
})

test('orders shared fields, environment keys and platform overrides deterministically', () => {
  const draft: ProjectConfigurationDraft = {
    service: {
      id: 'web',
      program: 'pnpm',
      args: ['dev', '--host', '127.0.0.1'],
      workingDirectory: 'apps/web',
      shell: true,
      envFiles: ['.env', 'apps/web/.env.local'],
      env: [
        { key: 'PORT', value: '3000' },
        { key: 'z_lower', value: 'last' },
        { key: 'NODE_ENV', value: 'development' },
        { key: '_FIRST', value: 'first' }
      ],
      macos: {
        args: ['dev', '--watch'],
        env: [{ key: 'WATCH_MODE', value: 'native' }]
      },
      windows: {
        program: 'pnpm.cmd',
        args: ['dev', '--watch'],
        env: [{ key: 'WATCH_MODE', value: 'poll' }]
      }
    }
  }
  const { source } = buildProjectConfigurationPreview(draft)
  expect(source.indexOf('schema_version')).toBeLessThan(source.indexOf('[services.web]'))
  expect(source.indexOf('program = "pnpm"')).toBeLessThan(source.indexOf('args = ['))
  expect(source.indexOf('NODE_ENV')).toBeLessThan(source.indexOf('PORT'))
  expect(source.indexOf('PORT')).toBeLessThan(source.indexOf('_FIRST'))
  expect(source.indexOf('_FIRST')).toBeLessThan(source.indexOf('z_lower'))
  expect(source.indexOf('[services.web.macos]')).toBeLessThan(
    source.indexOf('[services.web.windows]')
  )
  expect(source).toContain('shell = true')
})
