# Package.json Detection Proposal Design

## 1. Purpose

Ticket 03 adds safe, editable detection proposals for registered Development Projects whose root contains a `package.json`. Detection is advisory only: it never executes package scripts, never grants a proposal permission to bypass Project Configuration validation, and never writes `.devcontrol.toml` until the user previews and confirms the edited proposal.

The feature builds on ticket 02's repository-owned Project Configuration workflow and prepares the reusable proposal model needed by ticket 04's Docker Compose detector.

## 2. Scope

This ticket includes:

- automatic package detection immediately after a Development Project is registered;
- one proposal containing zero or more candidate Development Services inferred from root-level package scripts;
- review, edit, candidate removal, rejection, preview, and confirmation;
- a multi-service Project Configuration draft contract;
- fixed-path Host Runtime reads, narrow IPC/Preload intents, and real Electron acceptance tests;
- actionable detection errors that do not roll back successful Project Registration.

This ticket does not include:

- recursive workspace, monorepo, subpackage, or `node_modules` scanning;
- parsing or executing package script bodies;
- reading lockfiles to select a package manager;
- persisted proposals, automatic redisplay, or a manual “detect again” action;
- overwriting or editing an existing `.devcontrol.toml`;
- runtime preflight, package installation, process startup, or service execution;
- Docker Compose or any detector other than root `package.json`.

## 3. User Flow

1. The user registers a Development Project through the existing directory picker.
2. `projects.add()` completes Project Registration without depending on detection.
3. The Renderer automatically calls `detectionProposals.detect(projectId)` with the registered project ID.
4. Detection resolves the trusted project root through the Project Registry.
5. If `.devcontrol.toml` already exists, detection returns `none/configuration-exists` without reading `package.json`.
6. If `package.json` is absent or contains no matching scripts, detection returns `none` and the user remains on the project list.
7. If detection fails, registration remains intact. The UI shows an actionable error and offers return-to-list and manual-configuration paths.
8. If candidates exist, the UI opens one proposal review page containing every candidate service.
9. The user may edit any candidate with the same fields and validation rules as manual configuration, or remove candidates from the proposal.
10. Reject closes the current proposal and returns to the project list. It does not persist the proposal, write configuration, or execute a command.
11. Preview sends the edited multi-service draft through the existing Project Configuration boundary.
12. Confirm revalidates the same draft and atomically creates `.devcontrol.toml` with the existing no-replace behavior.

Rejected proposals are not persisted or automatically shown again. The Development Project remains registered and can later enter the manual configuration flow.

## 4. Public Contracts

### 4.1 Multi-service configuration draft

Ticket 02's single-service draft becomes the canonical multi-service shape:

```ts
export interface ProjectConfigurationDraft {
  services: DevelopmentServiceDraft[]
}
```

Manual configuration constructs an array with one service. Detection constructs an array with all remaining edited candidates. The configuration module requires at least one service, validates entries in input order, points duplicate-ID errors at the later entry, and serializes valid services in deterministic service-ID order.

Draft field paths use indexed forms:

```text
$.services[0].id
$.services[0].program
$.services[1].env[2].key
```

The persisted TOML parser retains its existing service-key paths, such as `$.services.web.program` and `$.services["Web"]`.

### 4.2 Detection proposal

```ts
export interface PackageJsonDetectionEvidence {
  kind: 'package_json'
  relativePath: 'package.json'
  scriptName: string
}

export interface PackageJsonDetectionCandidate {
  candidateId: string
  evidence: PackageJsonDetectionEvidence
  draft: DevelopmentServiceDraft
}

export interface PackageJsonDetectionProposal {
  projectId: string
  candidates: PackageJsonDetectionCandidate[]
}

export type DetectionProposalResult =
  | { kind: 'proposal'; proposal: PackageJsonDetectionProposal }
  | { kind: 'none'; reason: 'configuration-exists' | 'package-json-missing' | 'no-candidates' }
```

`candidateId` is stable and independent of the editable service ID so React identity and source evidence remain attached after edits. The proposal never contains an executable callback, file path supplied by the Renderer, or package script body.

### 4.3 Desktop API

```ts
interface DesktopApi {
  detectionProposals: {
    detect(projectId: string): Promise<ActionResult<DetectionProposalResult>>
  }
}
```

The fixed IPC channel is `detection-proposals:detect`. Its envelope contains only `projectId`. Sender authorization runs before envelope validation, matching the existing IPC security policy.

## 5. Detection Algorithm

### 5.1 Manifest shape

The detector parses JSON as data; it must not use `require()`, dynamic import, package-manager APIs, or process execution.

- The root JSON value must be a plain object.
- Missing `scripts` is equivalent to no candidates.
- A present `scripts` value must be a plain object.
- Every selected script must have a string value. The detector uses the value only to validate the manifest shape and never returns, logs, parses, or executes it.
- Invalid JSON, invalid root shape, invalid `scripts` shape, or a selected non-string script produces an actionable detection error without including manifest source.

### 5.2 Candidate selection

Only exact lowercase names matching the following rules are selected:

- `dev`
- `start`
- `serve`
- `watch`
- `dev:*`, with at least one character after the colon

All other scripts, including lifecycle hooks, tests, builds, releases, and differently cased names, are ignored. Selected scripts are ordered by script name using deterministic UTF-16 code-unit comparison.

### 5.3 Package manager

The detector reads the optional top-level `packageManager` string and recognizes only the package-name prefix before `@`:

- `pnpm`
- `npm`
- `yarn`
- `bun`

Missing, non-string, malformed, or unsupported values safely fall back to `npm`. No lockfile or file outside `package.json` is read for package-manager selection.

Each candidate uses a structured program and argument array:

```ts
{
  program: packageManager,
  args: ['run', scriptName],
  workingDirectory: '.',
  shell: false,
  envFiles: [],
  env: []
}
```

The package manager comes from a fixed allowlist, and the script name remains a separate argument. Detection never interprets the package script command.

### 5.4 Service IDs and candidate IDs

Service IDs are derived deterministically from script names:

1. lowercase the script name;
2. replace every run of characters outside `a-z` and `0-9` with one hyphen;
3. trim leading and trailing hyphens;
4. prefix `service-` if the result is empty or does not start with a letter;
5. truncate as needed to preserve the 64-character service-ID limit;
6. resolve collisions in candidate order with `-2`, `-3`, and so on, truncating the base before appending the suffix.

Examples:

| Script | Service ID |
| --- | --- |
| `dev` | `dev` |
| `dev:web` | `dev-web` |
| `dev:web:test` | `dev-web-test` |

`candidateId` is based on the original script name and its deterministic occurrence position. It is used only for proposal identity and is not persisted in `.devcontrol.toml`.

## 6. Component Boundaries

### 6.1 Pure detector

A new Electron-free TypeScript module accepts manifest source and returns candidate data or throws a structured detection error. It depends only on shared contracts and Control Center error construction. It has no filesystem, process, IPC, or UI imports.

### 6.2 Host Runtime

The Host Runtime gains one fixed-purpose operation:

```ts
inspectPackageJsonDetection(rootPath: string): Promise<
  | { kind: 'configuration-exists' }
  | { kind: 'package-json-missing' }
  | { kind: 'package-json'; source: string }
>
```

The Node implementation checks only `<root>/.devcontrol.toml` and `<root>/package.json` after the Control Center has revalidated the registered canonical root. It checks configuration existence first and does not read the manifest when configuration exists.

Before reading manifest contents, it resolves the manifest target and rejects a symbolic-link target outside the canonical project root. Filesystem absence maps to `package-json-missing`; access, type, or containment failures become actionable errors without source contents.

### 6.3 Control Center

`detectProjectConfiguration(projectId)`:

1. validates the project ID;
2. loads the registered project or returns `PROJECT_NOT_FOUND`;
3. re-inspects the stored root and uses the canonical path;
4. calls the fixed Host Runtime detection operation;
5. converts host outcomes into `DetectionProposalResult`;
6. invokes the pure detector only when source is present;
7. binds structured errors to the trusted Registry project ID.

Detection never participates in the Project Registration transaction. A detection failure cannot undo the inserted registry record.

### 6.4 Main and Preload

Main registers one fixed channel and rejects unknown, malformed, or prototype-bearing envelopes. Preload exposes one typed method and no raw `ipcRenderer`, path argument, arbitrary file read, or command execution surface.

### 6.5 Renderer

The App adds explicit detecting, detection-error, and proposal-review states after successful registration. A dedicated proposal view renders candidate source evidence and composes reusable service forms. The existing manual configuration route initializes the same multi-service workflow with one blank service.

Removing or editing a candidate invalidates the current preview. Preview and create retain the monotonic request sequencing and duplicate-submit protections from ticket 02. Proposal rejection returns to the project list without a backend mutation.

## 7. Error Handling

Detection errors use `ActionableError` with the registered Development Project as the resource and deterministic field paths where available.

Required cases include:

- package manifest cannot be read;
- package manifest is invalid JSON;
- manifest root or `scripts` has the wrong type;
- selected script value has the wrong type;
- package manifest resolves outside the Development Project root.

Messages state what failed and how to correct or bypass it, but do not include manifest source, script command text, environment values, raw dependency exceptions, or outside-project paths. The UI offers manual configuration after detection failure.

If `.devcontrol.toml` appears after detection but before confirmation, the existing atomic creation operation returns `PROJECT_CONFIGURATION_ALREADY_EXISTS`; it never overwrites the file.

## 8. Security Properties

- Renderer supplies only a project ID; the Registry remains the source of truth for root paths.
- Detection reads only fixed filenames in the registered project root.
- Existing configuration suppresses manifest reads.
- Package scripts are treated as opaque data and never executed or interpreted.
- Package script bodies do not cross the Control Center-to-Renderer boundary.
- The executable program is selected from a fixed package-manager allowlist.
- Script names are passed as separate arguments and are never concatenated into a shell command.
- Every proposed service has `shell: false`.
- Proposal confirmation receives no trust advantage and is revalidated by the Project Configuration module.
- Configuration publication retains ticket 02's atomic no-replace semantics.

## 9. Testing Strategy

### 9.1 Pure detector tests

Public behavior tests cover candidate-name selection, ignored scripts, package-manager choice and fallback, service-ID normalization and collisions, deterministic ordering, candidate defaults, malformed manifests, and the absence of script bodies from returned or serialized errors/results.

### 9.2 Multi-service configuration tests

Public preview and parser tests cover empty drafts, duplicate IDs, indexed error paths, multiple services, deterministic TOML ordering, platform overrides, path rules, and secret redaction. Existing single-service behavior remains covered through a one-element draft.

### 9.3 Host Runtime and Control Center tests

Contract tests verify fixed-file outcomes, configuration-first short-circuiting, outside-root symbolic-link rejection where the platform supports creating the fixture, trusted Registry roots, project-bound errors, registration survival after detection failure, and the absence of any execution call.

### 9.4 IPC and Renderer tests

IPC/Preload tests cover trusted-sender ordering, strict envelopes, fixed channels, clone-safe results, and the absence of arbitrary path/read/execute APIs.

Renderer tests cover registration-triggered detection, none/error/proposal states, source evidence, editing, candidate removal, rejection, manual fallback, multi-service preview and confirmation, stale async results, duplicate creation protection, page-level errors, keyboard access, and focus behavior.

### 9.5 Real Electron acceptance

Temporary Node projects contain selected scripts whose command bodies would create marker files if executed. Detection, rejection, editing, preview, and confirmation must leave every marker absent. Confirmation creates a parseable multi-service `.devcontrol.toml` with the edited values. The acceptance suite runs on macOS 14 and Windows 2025 CI against the exact pushed commit SHA.

## 10. Acceptance Criteria

- Registering a Development Project with root `package.json` automatically produces candidate long-running Development Services when matching scripts exist.
- The proposal displays program, arguments, working directory, and `package.json → scripts.<name>` evidence for every candidate.
- The user can edit and remove candidates before preview; the edited multi-service draft uses the same strict validation as manual configuration.
- Reject writes no Project Configuration, persists no proposal, and executes no candidate command.
- Confirm writes a valid, version-controlled `.devcontrol.toml` only after preview and revalidation.
- Detection never runs package scripts, never returns package script bodies, and never reads outside the registered Development Project root.
- Existing Project Configuration suppresses detection without reading `package.json`.
- Example Node projects cover detection, rejection, editing, and confirmation through public behavior and real Electron tests.
- Full local checks and exact-SHA macOS 14 plus Windows 2025 CI pass before ticket 03 moves to `ready-for-human`.

