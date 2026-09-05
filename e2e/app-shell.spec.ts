import { _electron as electron, expect, test } from '@playwright/test'

test('opens an empty project list', async ({}, testInfo) => {
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: testInfo.outputPath('user-data') }
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'Developer Control Center' })).toBeVisible()
    await expect(page.getByText('No projects yet')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const candidate = window as unknown as { desktop?: { projects?: object } }
      return {
        hasRequire: 'require' in window,
        hasProcess: 'process' in window,
        desktopKeys: candidate.desktop ? Object.keys(candidate.desktop) : [],
        projectKeys: candidate.desktop?.projects
          ? Object.keys(candidate.desktop.projects).sort()
          : []
      }
    })).toEqual({
      hasRequire: false,
      hasProcess: false,
      desktopKeys: ['projects'],
      projectKeys: ['add', 'list', 'remove']
    })

    const originalUrl = page.url()
    await page.evaluate(() => {
      window.location.href = 'https://example.com/'
    })
    await expect.poll(() => page.url()).toBe(originalUrl)

    const windowCount = app.windows().length
    await page.evaluate(() => window.open('https://example.com/', '_blank'))
    await expect.poll(() => app.windows().length).toBe(windowCount)
  } finally {
    await app.close()
  }
})
