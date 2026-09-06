import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createNodeProject, launchSelectedProject } from './package-json-project-fixture'

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Keyboard target was not reachable within 80 Tab presses.')
}

function relativeLuminance(color: string): number {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`)
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

function contrastRatio(first: string, second: string): number {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left)
  return (luminances[0]! + 0.05) / (luminances[1]! + 0.05)
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
      await expect.poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))).toEqual(size)
      await page.getByRole('button', { name: 'Add project' }).click()
      const configure = page.getByRole('button', { name: 'Configure sample-project' })
      await tabTo(page, configure)
      await page.keyboard.press('Enter')
      const program = page.getByLabel('Program')
      await tabTo(page, program)
      await page.keyboard.type('pnpm')
      const formStyles = await program.evaluate((element) => {
        const fields = element.closest('.service-configuration-fields')
        const help = fields?.querySelector('p')
        if (!fields || !help) throw new Error('Service configuration fields were not found.')
        return {
          display: getComputedStyle(fields).display,
          gap: getComputedStyle(fields).gap,
          helpFontSize: getComputedStyle(help).fontSize,
          helpMarginBottom: getComputedStyle(help).marginBottom
        }
      })
      expect(formStyles.display).toBe('grid')
      expect(Number.parseFloat(formStyles.gap)).toBeGreaterThan(0)
      expect(formStyles.helpFontSize).toBe('14px')
      expect(formStyles.helpMarginBottom).toBe('8px')
      await page.emulateMedia({ colorScheme: 'dark' })
      const darkInputColors = await program.evaluate((element) => {
        const panel = element.closest('.configuration-layout > section')
        if (!panel) throw new Error('Configuration panel was not found.')
        return {
          border: getComputedStyle(element).borderTopColor,
          panel: getComputedStyle(panel).backgroundColor
        }
      })
      expect(contrastRatio(darkInputColors.border, darkInputColors.panel)).toBeGreaterThanOrEqual(3)
      await page.screenshot({
        path: testInfo.outputPath(`project-configuration-editing-${size.width}x${size.height}.png`)
      })
      const previewButton = page.getByRole('button', { name: 'Preview configuration' })
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const preview = page.getByLabel('Project configuration preview')
      await expect(preview).toContainText('schema_version = 1')
      await expect.poll(() => page.evaluate(() => ({
        document: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        body: document.body.scrollWidth <= document.documentElement.clientWidth
      }))).toEqual({ document: true, body: true })
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

  test(`keeps package proposal keyboard-usable at ${size.width}x${size.height}`, async ({}, testInfo) => {
    const { projectRoot } = await createNodeProject(testInfo, `viewport-${size.width}`)
    const app = await launchSelectedProject(testInfo.outputPath(`package-user-data-${size.width}`), projectRoot)
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }, viewport) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(viewport.width, viewport.height)
      }, size)
      const add = page.getByRole('button', { name: 'Add project' })
      await tabTo(page, add)
      await page.keyboard.press('Enter')
      const serviceId = page.getByTestId('candidate-package-json:0:dev').getByLabel('Service ID')
      await tabTo(page, serviceId)
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.type('frontend')
      const remove = page.getByRole('button', { name: 'Remove suggested service dev:api' })
      await tabTo(page, remove)
      await page.keyboard.press('Enter')
      const previewButton = page.getByRole('button', { name: 'Preview configuration' })
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const previewPanel = page.getByLabel('Project configuration preview')
      await expect(previewPanel).toContainText('[services.frontend]')
      await expect.poll(() => page.evaluate(() => ({
        document: document.documentElement.scrollWidth <= window.innerWidth,
        body: document.body.scrollWidth <= window.innerWidth
      }))).toEqual({ document: true, body: true })
      await page.emulateMedia({ colorScheme: 'dark' })
      const previewColors = await previewPanel.evaluate((element) => {
        const style = getComputedStyle(element)
        return { foreground: style.color, background: style.backgroundColor }
      })
      expect(contrastRatio(previewColors.foreground, previewColors.background)).toBeGreaterThanOrEqual(4.5)
      const createButton = page.getByRole('button', { name: 'Create configuration' })
      await tabTo(page, createButton)
      await expect(createButton).toBeFocused()
      expect(await createButton.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
      expect(await createButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
      await page.screenshot({ path: testInfo.outputPath(`package-proposal-${size.width}x${size.height}.png`) })
      await page.keyboard.press('Enter')
      await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    } finally {
      await app.close().catch(() => undefined)
    }
  })
}
