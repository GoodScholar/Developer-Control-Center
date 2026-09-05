import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Keyboard target was not reachable within 80 Tab presses.')
}

for (const size of [{ width: 1100, height: 720 }, { width: 760, height: 520 }]) {
  test(`keeps configuration usable at ${size.width}x${size.height}`, async ({}, testInfo) => {
    const projectRoot = join(testInfo.outputPath(), 'sample-project')
    await mkdir(projectRoot, { recursive: true })
    const app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, DCC_E2E_USER_DATA: testInfo.outputPath('user-data') }
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow, dialog }, input) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(input.size.width, input.size.height)
        Object.defineProperty(dialog, 'showOpenDialog', {
          configurable: true,
          value: async () => ({ canceled: false, filePaths: [input.projectRoot] })
        })
      }, { size, projectRoot })
      await page.getByRole('button', { name: 'Add project' }).click()
      const configure = page.getByRole('button', { name: 'Configure sample-project' })
      await tabTo(page, configure)
      await page.keyboard.press('Enter')
      const program = page.getByLabel('Program')
      await tabTo(page, program)
      await page.keyboard.type('pnpm')
      const previewButton = page.getByRole('button', { name: 'Preview configuration' })
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const preview = page.getByLabel('Project configuration preview')
      await expect(preview).toContainText('schema_version = 1')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await preview.evaluate((element) => getComputedStyle(element).overflowX)).toMatch(/auto|scroll/)
      const back = page.getByRole('button', { name: 'Back to editing' })
      await tabTo(page, back)
      await page.keyboard.press('Enter')
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const createButton = page.getByRole('button', { name: 'Create configuration' })
      await tabTo(page, createButton)
      expect(await createButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.screenshot({
        path: testInfo.outputPath(`project-configuration-${size.width}x${size.height}.png`)
      })
      await page.keyboard.press('Enter')
      await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    } finally {
      await app.close().catch(() => undefined)
    }
  })
}
