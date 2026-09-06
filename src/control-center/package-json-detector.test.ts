import { expect, test } from 'vitest'
import { detectPackageJsonCandidates } from './package-json-detector'

test('selects only exact long-running script names in code-unit order', () => {
  const source = JSON.stringify({ scripts: {
    test: 42, Dev: 'ignored', 'prestart': 'ignored', 'dev:': 'ignored',
    watch: 'opaque-watch-body', 'dev:web': 'opaque-web-body', dev: 'opaque-dev-body',
    serve: 'opaque-serve-body', start: 'opaque-start-body', build: 'ignored'
  } })
  const candidates = detectPackageJsonCandidates(source)
  expect(candidates.map((candidate) => candidate.evidence.scriptName)).toEqual([
    'dev', 'dev:web', 'serve', 'start', 'watch'
  ])
  expect(candidates.map((candidate) => candidate.draft.args)).toEqual([
    ['run', 'dev'], ['run', 'dev:web'], ['run', 'serve'], ['run', 'start'], ['run', 'watch']
  ])
  expect(candidates.every((candidate) => candidate.draft.shell === false)).toBe(true)
  expect(candidates.every((candidate) => candidate.draft.workingDirectory === '.')).toBe(true)
  expect(candidates.every((candidate) => candidate.draft.envFiles.length === 0 && candidate.draft.env.length === 0)).toBe(true)
  expect(JSON.stringify(candidates)).not.toContain('opaque-')
})

test('treats missing scripts as no candidates', () => {
  expect(detectPackageJsonCandidates('{"name":"plain-package"}')).toEqual([])
})

test.each([
  ['pnpm@10.17.1', 'pnpm'], ['npm@11.5.2', 'npm'],
  ['yarn@4.9.2', 'yarn'], ['bun@1.2.22', 'bun'],
  [undefined, 'npm'], [null, 'npm'], ['pnpm', 'npm'], ['pnpm@', 'npm'],
  ['pnpm@10 extra', 'npm'], ['unknown@1.0.0', 'npm'], ['@scope/tool@1', 'npm']
] as const)('maps packageManager %s to %s', (packageManager, program) => {
  const source = JSON.stringify({ packageManager, scripts: { dev: 'opaque' } })
  expect(detectPackageJsonCandidates(source)[0]!.draft.program).toBe(program)
})

test('normalizes ids, truncates to 64 and resolves collisions in candidate order', () => {
  const long = `dev:${'x'.repeat(80)}`
  const candidates = detectPackageJsonCandidates(JSON.stringify({ scripts: {
    'dev::web': 'first-body', 'dev:-web': 'second-body', [long]: 'long-body'
  } }))
  expect(candidates.map((candidate) => candidate.draft.id)).toEqual([
    'dev-web', 'dev-web-2', `dev-${'x'.repeat(60)}`
  ])
  expect(new Set(candidates.map((candidate) => candidate.candidateId)).size).toBe(3)
  expect(candidates.every((candidate) => candidate.candidateId.startsWith('package-json:'))).toBe(true)
})

test.each([
  ['{"scripts":', 'PACKAGE_JSON_INVALID', '$'],
  ['[]', 'PACKAGE_JSON_ROOT_INVALID', '$'],
  ['{"scripts":[]}', 'PACKAGE_JSON_SCRIPTS_INVALID', '$.scripts'],
  ['{"scripts":{"dev":42}}', 'PACKAGE_JSON_SCRIPT_INVALID', '$.scripts["dev"]'],
  ['{"scripts":{"dev:web":null}}', 'PACKAGE_JSON_SCRIPT_INVALID', '$.scripts["dev:web"]']
] as const)('returns a fixed error for malformed manifest data', (source, code, fieldPath) => {
  let thrown: unknown
  try { detectPackageJsonCandidates(source) } catch (error) { thrown = error }
  expect(thrown).toMatchObject({ detail: { code, fieldPath, resource: { kind: 'project' } } })
  expect(JSON.stringify(thrown)).not.toContain(source)
})

test('never returns or leaks a selected script body', () => {
  const body = 'mutation-script-body-8f4e'
  const result = detectPackageJsonCandidates(JSON.stringify({ scripts: { dev: body } }))
  expect(JSON.stringify(result)).not.toContain(body)
})
