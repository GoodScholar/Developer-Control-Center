import { _electron as electron, expect, test } from '@playwright/test'

for (const size of [
  { width: 1100, height: 720 },
  { width: 760, height: 520 }
]) {
  test(`keeps the project shell usable at ${size.width}x${size.height}`, async ({}, testInfo) => {
    const app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, DCC_E2E_USER_DATA: testInfo.outputPath('user-data') }
    })
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }, bounds) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(bounds.width, bounds.height)
      }, size)
      await expect(page.getByRole('button', { name: 'Add project' })).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })))
        .toEqual(size)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true)
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Add project' })).toBeFocused()
      await page.screenshot({
        path: testInfo.outputPath(`ui-review-${size.width}x${size.height}.png`)
      })
    } finally {
      await app.close()
    }
  })
}
