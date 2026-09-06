export function controlIdForConfigurationField(fieldPath: string | undefined): string | undefined {
  const direct = fieldPath?.match(/^\$\.services\[(\d+)]\.(id|program|workingDirectory)$/)
  if (direct) {
    const field = direct[2] === 'workingDirectory' ? 'working-directory' : direct[2]
    return `service-${direct[1]}-${field}`
  }
  const row = fieldPath?.match(/^\$\.services\[(\d+)]\.(args|envFiles)\[(\d+)]$/)
  if (row) {
    const field = row[2] === 'args' ? 'argument' : 'env-file'
    return `service-${row[1]}-${field}-${row[3]}`
  }
  const environment = fieldPath?.match(/^\$\.services\[(\d+)]\.env\[(\d+)]\.(key|value)$/)
  if (environment) return `service-${environment[1]}-environment-${environment[3]}-${environment[2]}`
  const platformDirect = fieldPath?.match(/^\$\.services\[(\d+)]\.(macos|windows)\.program$/)
  if (platformDirect) return `service-${platformDirect[1]}-${platformDirect[2]}-program`
  const platformArgument = fieldPath?.match(/^\$\.services\[(\d+)]\.(macos|windows)\.args\[(\d+)]$/)
  if (platformArgument) return `service-${platformArgument[1]}-${platformArgument[2]}-argument-${platformArgument[3]}`
  const platformEnvironment = fieldPath?.match(/^\$\.services\[(\d+)]\.(macos|windows)\.env\[(\d+)]\.(key|value)$/)
  return platformEnvironment
    ? `service-${platformEnvironment[1]}-${platformEnvironment[2]}-environment-${platformEnvironment[4]}-${platformEnvironment[3]}`
    : undefined
}
