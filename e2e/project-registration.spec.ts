import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DesktopApi } from '../src/shared/contracts'

function launchApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: userData }
  })
}

test('registers, restores and safely unregisters a project', async ({}, testInfo) => {
  const projectRoot = join(testInfo.outputPath(), 'sample-project')
  await mkdir(projectRoot, { recursive: true })
  const marker = join(projectRoot, 'keep-me.txt')
  await writeFile(marker, 'preserve')
  const userData = testInfo.outputPath('user-data')

  let app = await launchApp(userData)
  try {
    await app.evaluate(({ dialog }, selectedPath) => {
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [selectedPath] })
      })
    }, projectRoot)
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeVisible()
    await app.close()

    app = await launchApp(userData)
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove sample-project' }).click()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeHidden()
    await app.close()

    app = await launchApp(userData)
    page = await app.firstWindow()
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { desktop: DesktopApi }).desktop.projects.list()
        )
      )
      .toEqual({ ok: true, value: [] })
    await expect(page.getByText('No projects yet')).toBeVisible()
    await expect(readFile(marker, 'utf8')).resolves.toBe('preserve')
  } finally {
    await app.close()
  }
})
