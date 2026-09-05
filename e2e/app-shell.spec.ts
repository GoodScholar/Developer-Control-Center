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
      const candidate = window as unknown as {
        desktop?: { projects?: object; projectConfigurations?: object }
      }
      return {
        hasRequire: 'require' in window,
        hasProcess: 'process' in window,
        desktopKeys: candidate.desktop ? Object.keys(candidate.desktop).sort() : [],
        projectKeys: candidate.desktop?.projects
          ? Object.keys(candidate.desktop.projects).sort()
          : [],
        configurationKeys: candidate.desktop?.projectConfigurations
          ? Object.keys(candidate.desktop.projectConfigurations).sort()
          : []
      }
    })).toEqual({
      hasRequire: false,
      hasProcess: false,
      desktopKeys: ['projectConfigurations', 'projects'],
      projectKeys: ['add', 'list', 'remove'],
      configurationKeys: ['create', 'preview']
    })

    const originalUrl = page.url()
    const navigatedExternally = page
      .waitForURL((url) => url.origin === 'https://example.com', { timeout: 7_000, waitUntil: 'commit' })
      .then(() => true)
      .catch(() => false)
    await page.evaluate(() => {
      window.location.href = 'https://example.com/'
    })
    expect(await navigatedExternally).toBe(false)
    expect(page.url()).toBe(originalUrl)

    const windowCount = app.windows().length
    const openedNewWindow = app
      .waitForEvent('window', { timeout: 7_000 })
      .then(() => true)
      .catch(() => false)
    await page.evaluate(() => window.open('https://example.com/', '_blank'))
    expect(await openedNewWindow).toBe(false)
    expect(app.windows()).toHaveLength(windowCount)
  } finally {
    await app.close()
  }
})
