# Licensing & clean-room strategy

## Summary

- This repository is licensed **GPL-3.0-or-later** (see [`../LICENSE`](../LICENSE)).
- The mobile UI is an **original clean-room implementation**. No third-party
  editor source was copied.
- **No third-party trademarks or branding** are used: no third-party product
  name, logo, icon set, color identity, or copied UI assets.

## Why GPL-3.0-or-later

The project was inspired by an open-source desktop editor whose source is
primarily **GPL-3.0-or-later**. To stay unambiguously compatible — and to keep
the option open to incorporate GPL-compatible components later — this repo
adopts the same license. Practical obligations we therefore accept:

1. **Source availability.** Anyone who receives the app binary can obtain the
   corresponding source under the GPL. For an App Store build this means
   publishing the exact source for each released version (e.g. a public repo or
   a written offer). See the App Store note in
   [`APP_STORE_COMPLIANCE.md`](APP_STORE_COMPLIANCE.md).
2. **Same-license redistribution.** Distributed modifications stay GPL-3.0+.
3. **License & copyright notices** are preserved in distribution.
4. **No additional restrictions** beyond the GPL are imposed on recipients.

## Clean-room rules followed here

- The UI, navigation, state model, services, highlighter, and diff logic were
  written from scratch for this repo. They reproduce **ideas and conventions**
  (multi-pane editors, command palettes, diff-first AI edits) — which are not
  copyrightable — not anyone's code or assets.
- Identifiers, comments, file structure, and styling are original.
- The color palette and the `</>` wordmark are original and generic. There is no
  use of any third-party brand asset.

## If you reuse GPL code later

You *may* incorporate code from a GPL-3.0-or-later project, because this repo is
already GPL-3.0-or-later. If you do:

- Keep the upstream copyright headers and `LICENSE`/`COPYING` notices intact.
- Record provenance (commit/file you took it from) in the PR and, ideally, a
  `THIRD_PARTY_NOTICES.md`.
- Do **not** combine GPL code with code under a GPL-incompatible license.
- Still do **not** import any trademark/brand assets, which are governed by
  trademark law independently of the code license.

## App Store + GPL caveat

GPL §6 forbids "further restrictions." Some readings conflict with App Store EULA
terms (DRM, device limits). The standard mitigations:

- Ship as the **sole copyright holder** (everything here is first-party), so you
  may also offer the binary under store terms while the source remains GPL; or
- Distribute via channels without conflicting terms (e.g. TestFlight for review,
  or Android/F-Droid), or relicense first-party code to a permissive license if
  you never actually link GPL third-party code.

Because **all code in this repo is first-party**, you retain the freedom to make
either choice. Revisit this file the moment any third-party GPL code is added.
