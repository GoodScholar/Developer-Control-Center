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
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    await expect(page.getByLabel('Project configuration preview')).toContainText('schema_version = 1')
    await page.getByRole('button', { name: 'Create configuration' }).click()
    await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    const source = await readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')
    expect(parseProjectConfiguration(source).services.web).toMatchObject({ program: 'pnpm', args: ['dev'], shell: false })
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
