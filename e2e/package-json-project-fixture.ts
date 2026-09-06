import { _electron as electron, expect, type ElectronApplication, type TestInfo } from '@playwright/test'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function launchApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: userData }
  })
}

export async function launchSelectedProject(userData: string, projectRoot: string): Promise<ElectronApplication> {
  const app = await launchApp(userData)
  await app.evaluate(({ dialog }, selectedPath) => {
    Object.defineProperty(dialog, 'showOpenDialog', {
      configurable: true,
      value: async () => ({ canceled: false, filePaths: [selectedPath] })
    })
  }, projectRoot)
  return app
}

export async function createNodeProject(testInfo: TestInfo, name: string) {
  const projectRoot = testInfo.outputPath(name)
  const markers = [
    join(projectRoot, 'dev-executed.marker'),
    join(projectRoot, 'api-executed.marker'),
    join(projectRoot, 'watch-executed.marker')
  ]
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
    packageManager: 'pnpm@10.17.1',
    scripts: {
      dev: `node -e "require('node:fs').writeFileSync('dev-executed.marker','ran')"`,
      'dev:api': `node -e "require('node:fs').writeFileSync('api-executed.marker','ran')"`,
      watch: `node -e "require('node:fs').writeFileSync('watch-executed.marker','ran')"`,
      test: 'ignored-body'
    }
  }), 'utf8')
  return { projectRoot, markers }
}

export async function expectMarkersAbsent(markers: readonly string[]): Promise<void> {
  for (const marker of markers) {
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' })
  }
}
