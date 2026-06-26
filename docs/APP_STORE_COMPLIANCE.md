# App Store compliance strategy

Code-editing apps are allowed on the App Store; apps that **download and execute
arbitrary code on-device** are not (Guideline 2.5.2). Pocket IDE is designed
around that line.

## The core rule we follow

> The app **edits source locally** but **executes builds/tests remotely**. All
> user-provided source code is viewable and editable by the user.

- The device is a **text editor + git client + remote control**. It never
  compiles or runs project code locally.
- Execution happens in an **isolated cloud workspace** over the network. The
  device only sends an approved command and renders streamed logs.
- There is no on-device interpreter/VM that runs user project code, no
  downloading of executable bundles to run locally, and no hidden code paths.

This keeps us clear of 2.5.2 while still giving users a real "run my tests"
experience.

## Guideline-by-guideline

| Guideline | Concern | How we comply |
|-----------|---------|---------------|
| **2.5.2** Executable code | No running arbitrary code on device | All execution is remote; device never evals project code |
| **4.7** Code interpreters | If ever added, code is user/educational | Not used today; remote runner is the execution path |
| **2.3** Accurate metadata | Describe remote execution honestly | Onboarding + Settings state where code runs |
| **5.1** Privacy | Repo contents & tokens | Tokens in Keychain via secure storage; encrypted local cache; clear disclosure |
| **3.1.1** In-app purchase | n/a for prototype | No digital-goods sales here |
| **Sign in** | Third-party login allowed | GitHub OAuth (PKCE/device-code); add Sign in with Apple if other social logins are introduced |

## User transparency requirements (built in)

- **Welcome** screen states that source stays editable on device and builds/tests
  run remotely.
- **Terminal** screen shows a notice, an explicit approved-command list, a live
  log stream, and a per-workspace command history. No background execution.
- **Settings** exposes "Confirm before each remote command" and "Encrypt local
  project cache."

## Network policy for the runner

- One workspace per project, isolated from others.
- Pull repo → apply **accepted** patches → run **only** user-approved commands →
  stream logs back. Nothing runs unprompted.

## GPL ↔ App Store

See [`LICENSING.md`](LICENSING.md#app-store--gpl-caveat). Because all code here is
first-party, the publisher can satisfy both the GPL source-availability
obligation and the store's distribution terms (dual offer as sole copyright
holder, or distribute via TestFlight/Android/F-Droid). Add no third-party GPL
code without revisiting that section.

## Pre-submission checklist

- [ ] Publish the exact source for the released version (GPL obligation).
- [ ] Confirm no on-device execution path for project code.
- [ ] Tokens stored in Keychain; cache encrypted; privacy nutrition label filled.
- [ ] Onboarding/marketing copy matches the remote-execution model (2.3).
- [ ] Sign in with Apple added if any non-GitHub social login is offered.
- [ ] Original branding only — no third-party trademarks or assets.
