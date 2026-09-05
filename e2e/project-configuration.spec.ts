import { _electron as electron, expect, test, type ElectronApplication, type TestInfo } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseProjectConfiguration } from '../src/control-center/project-configuration'

async function launchApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: userData }
  })
}

async function launchRegisteredProject(testInfo: TestInfo) {
  const projectRoot = join(testInfo.outputPath(), 'sample-project')
  const userData = testInfo.outputPath('user-data')
  await mkdir(projectRoot, { recursive: true })
  const app = await launchApp(userData)
  try {
    await app.evaluate(({ dialog }, selectedPath) => {
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [selectedPath] })
      })
    }, projectRoot)
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeVisible()
    return { app, page, projectRoot, userData }
  } catch (error) {
    await app.close().catch(() => undefined)
    throw error
  }
}

test('registers, previews and creates a parseable project configuration', async ({}, testInfo) => {
  const launched = await launchRegisteredProject(testInfo)
  let app = launched.app
  let page = launched.page
  const { projectRoot, userData } = launched
  try {
    await page.getByRole('button', { name: 'Configure sample-project' }).click()
    await page.getByLabel('Program').fill('pnpm')
    await page.getByRole('button', { name: 'Add argument' }).click()
    await page.getByLabel('Argument 1', { exact: true }).fill('dev')
    await page.getByLabel('Working directory').fill('packages/web')
    await page.getByRole('button', { name: 'Add environment value' }).click()
    await page.getByLabel('Environment key 1', { exact: true }).fill('SAFE_KEY')
    await page.getByLabel('Environment value 1', { exact: true }).fill('safe-value')
    await page.getByRole('button', { name: 'Add environment file' }).click()
    await page.getByLabel('Environment file 1', { exact: true }).fill('.env.local')
    await page.getByLabel('Run through shell').check()
    await page.getByRole('button', { name: 'macOS overrides' }).click()
    await page.getByLabel('macOS Program', { exact: true }).fill('pnpm-macos')
    await page.getByRole('button', { name: 'Add macOS argument' }).click()
    await page.getByLabel('macOS Argument 1', { exact: true }).fill('dev:macos')
    await page.getByRole('button', { name: 'Add macOS environment value' }).click()
    await page.getByLabel('macOS Environment key 1', { exact: true }).fill('MAC_ONLY')
    await page.getByLabel('macOS Environment value 1', { exact: true }).fill('1')
    await page.getByRole('button', { name: 'Windows overrides' }).click()
    await page.getByLabel('Windows Program', { exact: true }).fill('pnpm-windows')
    await page.getByRole('button', { name: 'Add Windows argument' }).click()
    await page.getByLabel('Windows Argument 1', { exact: true }).fill('dev:windows')
    await page.getByRole('button', { name: 'Add Windows environment value' }).click()
    await page.getByLabel('Windows Environment key 1', { exact: true }).fill('WINDOWS_ONLY')
    await page.getByLabel('Windows Environment value 1', { exact: true }).fill('1')
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    await expect(page.getByLabel('Project configuration preview')).toContainText('schema_version = 1')
    await page.getByRole('button', { name: 'Create configuration' }).click()
    await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    const source = await readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')
    expect(parseProjectConfiguration(source)).toEqual({
      schemaVersion: 1,
      services: {
        web: {
          program: 'pnpm',
          args: ['dev'],
          workingDirectory: 'packages/web',
          shell: true,
          envFiles: ['.env.local'],
          env: { SAFE_KEY: 'safe-value' },
          macos: { program: 'pnpm-macos', args: ['dev:macos'], env: { MAC_ONLY: '1' } },
          windows: { program: 'pnpm-windows', args: ['dev:windows'], env: { WINDOWS_ONLY: '1' } }
        }
      }
    })
    await app.close()
    app = await launchApp(userData)
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeVisible()
    await expect(readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')).resolves.toBe(source)
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('never overwrites an existing project configuration or leaks an environment value', async ({}, testInfo) => {
  const secretValue = 'e2e-secret-mutation-9021'
  const { app, page, projectRoot } = await launchRegisteredProject(testInfo)
  const target = join(projectRoot, '.devcontrol.toml')
  await writeFile(target, 'existing-marker', 'utf8')
  try {
    await page.getByRole('button', { name: 'Configure sample-project' }).click()
    await page.getByLabel('Program').fill('pnpm')
    await page.getByRole('button', { name: 'Add environment value' }).click()
    await page.getByLabel('Environment key 1', { exact: true }).fill('SAFE_KEY')
    await page.getByLabel('Environment value 1', { exact: true }).fill(secretValue)
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    await page.getByRole('button', { name: 'Create configuration' }).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('already exists')
    await expect(alert).not.toContainText(secretValue)
    await expect(readFile(target, 'utf8')).resolves.toBe('existing-marker')
  } finally {
    await app.close().catch(() => undefined)
  }
})
