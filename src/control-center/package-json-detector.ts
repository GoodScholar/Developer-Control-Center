import type { PackageJsonDetectionCandidate } from '../shared/contracts'
import { packageJsonDetectionError } from './errors'

type UnknownRecord = Record<string, unknown>

const exactScripts = new Set(['dev', 'start', 'serve', 'watch'])
const packageManagers = new Set(['pnpm', 'npm', 'yarn', 'bun'])

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function fail(code: string, fieldPath: string, message: string, nextAction: string): never {
  throw packageJsonDetectionError(code, fieldPath, message, nextAction)
}

function selectedScript(name: string): boolean {
  return exactScripts.has(name) || (name.startsWith('dev:') && name.length > 4)
}

function packageManagerFrom(value: unknown): string {
  if (typeof value !== 'string') return 'npm'
  const match = value.match(/^([^@\s]+)@([^@\s]+)$/)
  return match && packageManagers.has(match[1]!) ? match[1]! : 'npm'
}

function baseServiceId(scriptName: string): string {
  let value = scriptName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (value.length === 0 || !/^[a-z]/.test(value)) value = `service-${value}`.replace(/-+$/, '')
  return value.slice(0, 64).replace(/-+$/, '')
}

function uniqueServiceId(scriptName: string, used: Set<string>): string {
  const base = baseServiceId(scriptName)
  let candidate = base
  for (let occurrence = 2; used.has(candidate); occurrence += 1) {
    const suffix = `-${occurrence}`
    candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/, '')}${suffix}`
  }
  used.add(candidate)
  return candidate
}

export function detectPackageJsonCandidates(source: string): PackageJsonDetectionCandidate[] {
  let document: unknown
  try {
    document = JSON.parse(source)
  } catch {
    fail('PACKAGE_JSON_INVALID', '$', 'The package manifest is not valid JSON.', 'Correct package.json or configure the project manually.')
  }
  if (!isRecord(document)) {
    fail('PACKAGE_JSON_ROOT_INVALID', '$', 'The package manifest root must be an object.', 'Correct package.json or configure the project manually.')
  }
  if (document.scripts === undefined) return []
  if (!isRecord(document.scripts)) {
    fail('PACKAGE_JSON_SCRIPTS_INVALID', '$.scripts', 'The package scripts field must be an object.', 'Correct package.json or configure the project manually.')
  }
  const scripts = document.scripts
  const scriptNames = Object.keys(scripts).filter(selectedScript).sort(compareCodeUnits)
  for (const scriptName of scriptNames) {
    if (typeof scripts[scriptName] !== 'string') {
      fail('PACKAGE_JSON_SCRIPT_INVALID', `$.scripts[${JSON.stringify(scriptName)}]`, 'The selected package script must be a string.', 'Correct package.json or configure the project manually.')
    }
  }
  const program = packageManagerFrom(document.packageManager)
  const usedIds = new Set<string>()
  return scriptNames.map((scriptName, index) => ({
    candidateId: `package-json:${index}:${scriptName}`,
    evidence: { kind: 'package_json', relativePath: 'package.json', scriptName },
    draft: {
      id: uniqueServiceId(scriptName, usedIds),
      program,
      args: ['run', scriptName],
      workingDirectory: '.',
      shell: false,
      envFiles: [],
      env: []
    }
  }))
}
