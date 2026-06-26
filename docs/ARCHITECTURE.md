# Architecture

## Overview

Pocket IDE is a React Native (Expo) client backed by a set of replaceable
services and an optional Rust core for text editing. The client is fully
offline-capable for browsing/editing; anything that executes code is delegated
to a remote runner.

```
┌─────────────────────────────────────────────────────────────┐
│  React Native client (app/)                                  │
│                                                              │
│  App.tsx ── Gate ── AppShell ──┬─ phone: bottom nav          │
│                                └─ tablet: tree │ editor │ AI  │
│                                                              │
│  state/AppState.tsx  (single source of truth, intent actions)│
│        │                                                     │
│        ├── services/ (interfaces)                            │
│        │     GitHubService  AiService  GitService            │
│        │     RunnerService  StorageService                   │
│        │                                                     │
│        └── editor/ highlight.ts (Tree-sitter slot)           │
│                    diff.ts (LCS line diff)                    │
└───────────────┬───────────────────────────┬─────────────────┘
                │ FFI (cdylib)               │ HTTPS
        ┌───────┴────────┐          ┌────────┴─────────────────┐
        │ engine/ (Rust) │          │ Cloud services           │
        │ TextBuffer core│          │  • AI proxy (Claude API) │
        └────────────────┘          │  • Remote runner workspace│
                                    │  • (GitHub talks direct)  │
                                    └──────────────────────────┘
```

## Client state & data flow

`AppState` holds session, repo, editor, chat, diff, runner, git, and navigation
state. Screens never call services directly; they call **intent actions**
(`openRepo`, `selectFile`, `sendToAssistant`, `resolveDiff`, `runCommand`,
`commitAndPush`, …). This keeps the UI declarative and makes the services
trivially swappable.

Editing flow:

1. `selectFile(path)` loads file content (from the dirty cache if edited).
2. `editFile(text)` updates the open buffer and records the path as dirty.
3. The assistant may return `proposedDiffs`; these land on the Diff screen as
   `pending`. `resolveDiff(id, 'accepted')` writes the patched text into the
   dirty cache (the assistant never mutates files itself).
4. `commitAndPush(message)` stages, commits, pushes, and clears dirty state.

## Shared editor engine (`engine/`)

A dependency-free Rust crate exposing a `TextBuffer` with offset-based
insert/delete and line lookups. It builds as both `rlib` (Rust/tests) and
`cdylib` (native library) so the same editing semantics can be shared:

- **iOS**: Swift calls the C ABI from the `cdylib`.
- **Android**: JNI binding to the same library.
- **React Native**: a thin native module, or a WASM build for JS.

The prototype's TypeScript editor is self-contained; the Rust core is the
forward path for a rope-backed buffer, large-file performance, and consistent
edit semantics across platforms.

## Syntax highlighting

`editor/highlight.ts` tokenizes a line into colored spans. It is the integration
point for **Tree-sitter**: replace `tokenizeLine` with a Tree-sitter parser
(WASM or native) that emits the same `Token[]`. The `CodeEditor` renders a
highlighted layer behind a transparent `TextInput`, the standard RN technique
for inline highlighting.

## GitHub integration

`GitHubService` covers OAuth, repo list, branch list, file tree, and file read.
Production: OAuth via PKCE or the device-code flow (no client secret on device);
repo/tree/file via REST or GraphQL; large repos use sparse/partial fetch rather
than a full clone on device.

## Remote runner

`RunnerService.ensureWorkspace` provisions (or reuses) an **isolated cloud
workspace** keyed by repo+branch. `run(workspaceId, command, onLog)` executes a
single approved command and streams logs. Guarantees enforced by the UI and
intended for the backend:

- Only commands on an explicit allow-list can be launched.
- Each run is user-initiated; there are no hidden/background commands.
- Logs stream live; a per-workspace command **history** is retained.
- Accepted patches are applied in the workspace before a run; source remains
  viewable/editable on device.

## Local storage

`StorageService` is the encrypted local project cache. Production uses
`expo-secure-store` for secrets (tokens) and an encrypted file cache for repo
contents, so credentials never sit in plaintext.

## Navigation & responsiveness

`AppShell` switches on `useWindowDimensions().width` at the `TABLET_BREAKPOINT`
(760pt). Phone: a 5-item bottom bar + floating command-palette button. Tablet:
file tree (left), active screen (center, with a segmented tab bar), assistant
(right). The command palette is reachable from the floating button on both.
