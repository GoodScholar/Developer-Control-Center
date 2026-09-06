import { expect, test } from 'vitest'
import { controlIdForConfigurationField } from './configuration-field-focus'

test.each([
  ['$.services[0].id', 'service-0-id'],
  ['$.services[1].program', 'service-1-program'],
  ['$.services[2].workingDirectory', 'service-2-working-directory'],
  ['$.services[0].args[3]', 'service-0-argument-3'],
  ['$.services[1].envFiles[2]', 'service-1-env-file-2'],
  ['$.services[2].env[4].key', 'service-2-environment-key-4'],
  ['$.services[2].env[4].value', 'service-2-environment-value-4'],
  ['$.services[0].macos.program', 'service-0-macos-program'],
  ['$.services[0].macos.args[1]', 'service-0-macos-argument-1'],
  ['$.services[0].macos.env[2].key', 'service-0-macos-environment-key-2'],
  ['$.services[0].macos.env[2].value', 'service-0-macos-environment-value-2'],
  ['$.services[1].windows.program', 'service-1-windows-program'],
  ['$.services[1].windows.args[1]', 'service-1-windows-argument-1'],
  ['$.services[1].windows.env[2].key', 'service-1-windows-environment-key-2'],
  ['$.services[1].windows.env[2].value', 'service-1-windows-environment-value-2']
] as const)('maps %s to %s', (fieldPath, controlId) => {
  expect(controlIdForConfigurationField(fieldPath)).toBe(controlId)
})

test.each(['$.services', '$.services[4].args[0].unknown', '$.services.web.program', undefined])(
  'does not map unknown or unrendered path %s', (fieldPath) => {
    expect(controlIdForConfigurationField(fieldPath)).toBeUndefined()
  }
)
