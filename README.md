# Pocket IDE — Mobile AI Coding IDE (prototype)

A touch-first, dark-mode-native mobile IDE that lets you connect GitHub, open a
repository, browse and edit code, chat with an AI coding assistant, review
proposed patches, run tests/builds in a secure cloud workspace, and commit &
push — all from a phone or tablet.

This is an original, **clean-room** project. It is *inspired by* the general
shape of modern desktop code editors (multi-pane layout, command palette,
diff-first AI edits) but uses **no third-party branding, logos, names, icons, or
copyrighted UI assets**, and copies no third-party source. See
[`docs/LICENSING.md`](docs/LICENSING.md).

> Status: **working prototype**. The full UI and all flows are implemented and
> clickable against typed **stub services**. The seams for real GitHub OAuth, a
> hosted AI model, real git, and a production cloud runner are defined as
> interfaces and documented below — each drops in without UI changes.

---

## Repository layout

```
.
├── app/                 Expo + React Native + TypeScript mobile client
│   ├── App.tsx          Auth/repo gate -> responsive AppShell
│   └── src/
│       ├── theme/       Dark-first design tokens (original palette)
│       ├── state/       AppState context: single source of truth
│       ├── services/    Interfaces + stub implementations + mock data
│       ├── editor/      Highlighter (Tree-sitter slot) + line diff
│       ├── components/  CodeEditor, FileTree, DiffView, CommandPalette, ...
│       ├── navigation/  Responsive shell (phone bottom-nav / iPad 3-pane)
│       └── screens/     The 10 product screens
├── engine/              Rust "shared editor engine" (FFI-ready text buffer)
├── docs/                Architecture, licensing, App Store compliance
└── .claude/             Claude Code web SessionStart hook
```

## Platforms

- **iOS first**, iPad-optimized (three-pane split view).
- **Android-ready** via the same React Native codebase.
- Responsive: a phone uses bottom navigation; a tablet (≥ 760pt wide) uses the
  file-tree / editor / assistant three-pane layout.

Cross-platform React Native was chosen over SwiftUI specifically to satisfy the
"iOS **and** Android" requirement from one codebase. The performance-sensitive
text core lives in the Rust `engine/` crate so it can be shared natively.

## The 10 screens

1. **Welcome / GitHub sign-in** — `screens/WelcomeScreen.tsx`
2. **Repository picker** — `screens/RepoPickerScreen.tsx`
3. **Project dashboard** — `screens/DashboardScreen.tsx`
4. **File explorer** — `screens/ExplorerScreen.tsx` (+ `components/FileTree.tsx`)
5. **Code editor** — `screens/EditorScreen.tsx` (+ `components/CodeEditor.tsx`)
6. **AI assistant panel** — `screens/AssistantScreen.tsx`
7. **Diff review** — `screens/DiffScreen.tsx` (+ `components/DiffView.tsx`)
8. **Terminal / remote run output** — `screens/TerminalScreen.tsx`
9. **Commit** — `screens/CommitScreen.tsx`
10. **Settings** — `screens/SettingsScreen.tsx`

## Editor features

Syntax highlighting (pluggable — see "Tree-sitter" below), line-number toggle,
find + replace, undo/redo, long-press selection (native), and a keyboard
accessory row with Tab, `{}`, `()`, `[]`, quotes, slash, comment toggle, and
arrow keys. Minimap is reserved for the tablet layout.

## AI assistant

The assistant **proposes patches, never edits silently**. Any code change comes
back as a `DiffHunk` you accept or reject on the Diff Review screen; accepted
hunks become unsaved edits you can then commit. It can also explain a file,
summarize repo structure, generate a commit message, and trigger remote tests.

## Remote runner (safety model)

Builds/tests run in an **isolated cloud workspace per project**, never on the
device. Only an explicit, **user-approved** command list can be launched; logs
stream back to the Terminal screen; **nothing runs in the background**; and a
command history is kept. This is also the App Store strategy — see
[`docs/APP_STORE_COMPLIANCE.md`](docs/APP_STORE_COMPLIANCE.md).

## Tree-sitter slot

`app/src/editor/highlight.ts` is a small, dependency-free tokenizer used so the
prototype highlights code with zero native modules. It emits a `Token[]` shape
that a real **Tree-sitter** parser (compiled to WASM or a native module) can
produce instead — the renderer in `CodeEditor` doesn't care how tokens are made.

## Run it

```bash
cd app
npm install
npm run typecheck      # tsc --noEmit (CI gate)
npm start              # Expo dev server (press i / a for iOS / Android)
```

The shared engine:

```bash
cd engine
cargo test             # unit tests for the text buffer
cargo run --bin engine-demo
```

## What's stubbed vs. real

| Capability        | Prototype (today)                     | Production seam                              |
|-------------------|---------------------------------------|----------------------------------------------|
| GitHub            | `StubGitHubService` + mock repos      | OAuth (PKCE/device) + REST/GraphQL           |
| AI assistant      | `StubAiService` (scripted, streaming) | Server-proxied Claude API (no key on device) |
| Git               | `StubGitService` (in-memory status)   | isomorphic-git / libgit2 / remote git        |
| Remote runner     | `StubRunnerService` (scripted logs)   | Per-project isolated cloud workspace         |
| Local cache       | `MemoryStorageService`                | `expo-secure-store` + encrypted FS           |

Every row is an interface in `app/src/services/types.ts`; swapping an
implementation requires no screen changes.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data flow, runner.
- [`docs/LICENSING.md`](docs/LICENSING.md) — GPL strategy & clean-room rules.
- [`docs/APP_STORE_COMPLIANCE.md`](docs/APP_STORE_COMPLIANCE.md) — review guidelines.

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE) and [`docs/LICENSING.md`](docs/LICENSING.md).
