import { expect, test } from '@playwright/test'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseProjectConfiguration } from '../src/control-center/project-configuration'
import { createNodeProject, expectMarkersAbsent, launchApp, launchSelectedProject } from './package-json-project-fixture'

test('opens a package proposal after registration without executing scripts', async ({}, testInfo) => {
  const { projectRoot, markers } = await createNodeProject(testInfo, 'red-project')
  const app = await launchSelectedProject(testInfo.outputPath('red-user-data'), projectRoot)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expectMarkersAbsent(markers)
    await expect(page.getByRole('heading', { name: 'Review detected services' })).toBeVisible()
    const dev = page.getByTestId('candidate-package-json:0:dev')
    await expect(dev.getByLabel('Program')).toHaveValue('pnpm')
    await expect(dev.getByRole('textbox', { name: 'Argument 1' })).toHaveValue('run')
    await expect(dev.getByRole('textbox', { name: 'Argument 2' })).toHaveValue('dev')
    await expect(dev.getByLabel('Working directory')).toHaveValue('.')
    await expect(dev.getByText('package.json → scripts.dev')).toBeVisible()
    await expectMarkersAbsent(markers)
  } finally {
    await app.close()
  }
})

test('detects and rejects package suggestions without writing or executing scripts', async ({}, testInfo) => {
  const { projectRoot, markers } = await createNodeProject(testInfo, 'reject-project')
  const userData = testInfo.outputPath('reject-user-data')
  let app = await launchSelectedProject(userData, projectRoot)
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByRole('heading', { name: 'Review detected services' })).toBeVisible()
    await expect(page.getByText('package.json → scripts.dev', { exact: true })).toBeVisible()
    await expect(page.getByText('package.json → scripts.dev:api', { exact: true })).toBeVisible()
    await expect(page.getByText('package.json → scripts.watch', { exact: true })).toBeVisible()
    await expectMarkersAbsent(markers)
    await page.getByRole('button', { name: 'Reject suggestions' }).click()
    await expect(page.getByRole('heading', { name: 'reject-project' })).toBeVisible()
    await expect(access(join(projectRoot, '.devcontrol.toml'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expectMarkersAbsent(markers)
    await app.close()
    app = await launchApp(userData)
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'reject-project' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review detected services' })).toBeHidden()
    await expectMarkersAbsent(markers)
  } finally {
    await app.close().catch(() => undefined)
  }
})

test('edits and confirms a parseable multi-service proposal without executing scripts', async ({}, testInfo) => {
  const { projectRoot, markers } = await createNodeProject(testInfo, 'confirm-project')
  const app = await launchSelectedProject(testInfo.outputPath('confirm-user-data'), projectRoot)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    const dev = page.getByTestId('candidate-package-json:0:dev')
    await dev.getByLabel('Service ID').fill('frontend')
    await dev.getByLabel('Working directory').fill('apps/web')
    await page.getByRole('button', { name: 'Remove suggested service dev:api' }).click()
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    const preview = page.getByLabel('Project configuration preview')
    await expect(preview).toContainText('[services.frontend]')
    await expect(preview).toContainText('[services.watch]')
    await expect(preview).not.toContainText('[services.dev-api]')
    await expectMarkersAbsent(markers)
    await page.getByRole('button', { name: 'Create configuration' }).click()
    await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    const source = await readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')
    expect(parseProjectConfiguration(source)).toEqual({
      schemaVersion: 1,
      services: {
        frontend: { program: 'pnpm', args: ['run', 'dev'], workingDirectory: 'apps/web', shell: false, envFiles: [], env: {} },
        watch: { program: 'pnpm', args: ['run', 'watch'], workingDirectory: '.', shell: false, envFiles: [], env: {} }
      }
    })
    await expectMarkersAbsent(markers)
  } finally {
    await app.close()
  }
})
