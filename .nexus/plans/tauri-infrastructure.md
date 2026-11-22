---
nexus-plan: 2
title: Blinkr Tauri infrastructure
branch: chore/tauri-infra
base: main
tasks: tauri-infrastructure.tasks.yaml
setup:
  - 'if [ -f package.json ]; then pnpm install --frozen-lockfile; fi'
checks:
  - |
    node --input-type=module <<'NODE'
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import { readFileSync } from 'node:fs';
    import test from 'node:test';

    test('preserve the existing Blinkr product requirements', () => {
      const original = execFileSync('git', ['show', '39238ccdaa2730364d2b8a0a33b5ddfbc84a6b2d:README.md'], { encoding: 'utf8' });
      const requirements = original.split('\n## Status\n')[0];
      const normalize = (value) => value.replace(/\s+/g, ' ').trim();
      assert.ok(normalize(readFileSync('README.md', 'utf8')).startsWith(normalize(requirements)));
    });
    NODE
  - |
    if [ -f package.json ]; then
      pnpm install --frozen-lockfile &&
      pnpm format:check &&
      pnpm lint &&
      pnpm typecheck &&
      pnpm build &&
      pnpm test &&
      cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check &&
      cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings &&
      cargo test --manifest-path src-tauri/Cargo.toml --locked
    else
      test -z "$(git log -1 --format=%H -- package.json)"
    fi
  - git diff --check
parallel: 1
review: per-phase
commit-style: "conventional, scope required, e.g. feat(infra): scaffold the desktop application"
---

# Blinkr Tauri infrastructure

## Goal

Set up a runnable Tauri v2 desktop application with a React and strict TypeScript
frontend built by Vite and managed with pnpm. Provide reproducible toolchains,
developer checks, unsigned desktop build configuration, native CI compilation on
macOS, Windows and Linux, and practical setup documentation. Preserve the existing
Blinkr product requirements. Timer behavior, settings, persistence, product design,
signing, notarization, updates and releases are outside this infrastructure change.

## Context

- Base is `main` at `39238ccdaa2730364d2b8a0a33b5ddfbc84a6b2d`. The only tracked
  file is `README.md`, the product requirements; read it first. No app, CI, tests or
  repository/ancestor `AGENTS.md` existed at inspection.
- Create the frontend at the repository root and the Rust desktop project at
  `src-tauri/`. Paths in task file lists other than `README.md` are explicit
  creation targets, not claims about existing files.
- Use Node 24.15.0, pnpm 9.15.9 and Rust 1.99.1, with committed pnpm/Cargo lockfiles.
  These versions are installed locally; the official Rust 1.99.1 distribution
  manifest was reachable during planning. Choose compatible stable React,
  TypeScript, Vite and Tauri v2 dependencies and verify them together.
- Local host is macOS: Homebrew `cargo`/`rustc` 1.99.1, rustfmt 1.10.0,
  Clippy 0.1.99 and Xcode at `/Applications/Xcode.app/Contents/Developer`.
  `rustup` is absent. Do not assume it exists or alter global tool installations.
  Toolchain files must also work with rustup on CI.
- Tauri/Vite contract: loopback port 1420 with strict port selection;
  `beforeDevCommand: pnpm dev`, `beforeBuildCommand: pnpm build`,
  `devUrl: http://localhost:1420`, `frontendDist: ../dist`.
  App metadata defaults: Blinkr, 0.1.0, identifier `dev.blinkr.desktop`.
- Keep the launch screen minimal and neutral, with a small Blinkr marker. No timer,
  controls, sample counter, greet IPC, opener plugin or network features. This is a
  scaffold verification surface and needs no product mockup.
- Checks run from each worktree root. The requirements test above preserves the
  original README content before its current Status heading, allowing formatting
  whitespace changes. Append developer guidance after those requirements;
  update Status to describe the scaffold.
- At the requirements-only base, the package-check command uses its explicit
  bootstrap branch. Once the scaffold exists it installs dependencies, rebuilds
  ignored frontend output, then runs the real infrastructure tests and native
  checks. A deleted manifest with package history fails the bootstrap branch.
  Read Node's test totals and command exit codes; never suppress failures.
- Author CI without publishing or pushing. Local verification cannot establish a
  remote matrix result. Each task must report actual commands, outcomes and any
  runtime limitation honestly.

## Done means

- A fresh checkout can install from the pnpm lockfile, typecheck, lint, pass
  formatting, build React/Vite output, and compile the Tauri application with
  locked Rust dependencies. Both lockfiles and matching tool pins are tracked.
- All listed checks pass after each task. Infrastructure tests run at least one
  test and exercise actual Vite config resolution and built asset paths used by
  Tauri; they fail on missing output or inconsistent paths. No placeholder React
  or Rust tests are added simply to increase coverage.
- A native development launch is exercised immediately after the first runnable
  scaffold. A production macOS .app is built and a launch is attempted after the
  final changes, with evidence distinguishing a visible window from process-only
  startup and explicitly listing any blockers as defects.
- The app has a normal resizable window, complete referenced desktop icon assets,
  correct dev/build wiring, and only permissions needed for the empty shell.
  No product behavior or out-of-scope distribution service is added.
- CI defines frontend quality checks, Rust formatting/Clippy checks, and native
  macOS/Windows/Linux production compilation, using correct platform packages,
  matching version pins and locked dependency installation. It requires no
  signing credentials, release permissions or publishing steps.
- README retains all original product requirements and clearly documents
  prerequisites, supported tools, development/check/build commands and platform
  limits. Generated output, dependencies and local configuration stay ignored.
  Documentation labels unexecuted remote checks as unverified.

## Decisions

- The user approved React + TypeScript, Vite, pnpm, Tauri v2, developer tooling,
  native CI and setup documentation, with a minimal screen for launch verification.
- The user explicitly authorized starting existing run
  `0757379a-2d03-4601-9818-7f8601e25433`; do not create a second run.
- The requested 6.1 Sol / high setting applies to this planner only and has been
  reverified. Implementation and review retain the existing run defaults.
- Use the installed, verified tool versions above, port 1420, a neutral shell,
  and development app identifier `dev.blinkr.desktop` as routine scaffold defaults.
- Final landing requires separate user approval after implementation and checks.
  The user prohibited pushing.

## Planner notes

Research on 2026-11-21 reverified a clean main checkout and read `README.md` in full.
The proposed new app/configuration paths below do not exist yet. Two dependent
tasks in one phase keep the scaffold contract under one owner and put CI/docs
against its actual scripts. No extra mockup, human design checkpoint, product
tests or feature implementation is needed for this infrastructure-only scope.

All three exact frontmatter checks were executed at base with exit 0. The first
ran one real Node test preserving requirements. A deliberate failing variant
exited 1, confirming failure propagation. There is no pre-existing application
suite: the package check's scaffold branch cannot run until T1 creates it; its
bootstrap branch passed at base. T1 must supply and execute meaningful
infrastructure tests; no future build, native launch or remote CI result is
claimed by this baseline.

Official references inspected:

- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/start/frontend/vite/
- https://v2.tauri.app/distribute/pipelines/github/

The upstream CI article includes release publishing; use only its prerequisite
guidance, not release actions. Linux compilation needs WebKitGTK 4.1 and GTK
development libraries; Windows needs MSVC build tools, Windows SDK and WebView2.
Use native hosted runners without cross-compiling. Homebrew Rust has local
formatting and Clippy commands, so installing rustup is unnecessary locally.
Keep `.nexus/` out of general formatting scans because the runner rewrites plans.

## Log

<!-- Written by Nexus: task findings, review cycles, checkpoint verdicts and final report. -->

### 2026-11-21 · T2 · conflict: delegate_agent
The integration was refused: git add exited with code 1.

Resolve with an agent: codex, gpt-6.1-sol (try 1).

### 2026-11-21 · T2 · resolver: done
Run branch was already integrated; no conflicts remained. Working tree is clean.
All plan checks, YAML validation, actionlint, and action-version checks passed.
Fresh-source frozen install, frontend build, three infrastructure tests, and
pnpm tauri build --no-bundle --ci passed on macOS.
pnpm tauri build --bundles app --ci produced
src-tauri/target/release/bundle/macos/Blinkr.app.
Launch succeeded without Vite; native process startup and an OS-reported on-screen
window were observed. Visual rendering and resizing remain unverified because
accessibility automation is disabled.
Manual verification: open src-tauri/target/release/bundle/macos/Blinkr.app,
then drag a window edge to resize.
Windows/Linux builds and remote CI remain unverified.
defects: []

### 2026-11-21 · T2 · conflict: manual_resolved
The integration was refused: git add exited with code 1.

Resolved by hand in `/Users/jeremyasuncionnetflix.com/.nexus-code/worktrees/dev-blinkr/chore-tauri-infra-tasks/chore-tauri-infra--T2`.

Fixed the staging failure on run branch chore/tauri-infra in commit 6df5685: .gitignore now permits .nexus/plans/*.md and *.tasks.yaml while ignoring local Nexus state. Verified git add --dry-run for both plan files exits 0, local output stays ignored, and all preexisting staged/unstaged runner plan updates were preserved. T2 branch remains clean with verified commits 10ecb80 and b84d8b8; preserve this work and retry integration.

### 2026-11-21 · T1 · done
Passed frozen install, formatting, lint, typecheck, Vite build, infrastructure tests, Rust fmt/Clippy/tests, and `pnpm tauri build --no-bundle --ci`.
Built the production macOS .app and launched it; the Blinkr native process stayed alive. The dev launch also served Vite and started the native process. Both task-started processes were stopped.
README content and Status remain unchanged; only Prettier-required whitespace changed.

Defects:

- not blocking · Window rendering and resize could not be visually inspected · macOS accessibility automation
  osascript is not allowed assistive access. (-25211)

### 2026-11-21 · T2 · conflict: manual_resolved
The integration was refused: git commit exited with code 1.

Resolved by hand in `/Users/jeremyasuncionnetflix.com/.nexus-code/worktrees/dev-blinkr/chore-tauri-infra-tasks/chore-tauri-infra--T2`.

The ignore fix is committed and staging now succeeds. During the first retry the runner completed its deferred T1 checkoff (event 42, plan commit d5ab6e7) after a transient git commit failure. The run working tree and index are now clean. Retry integration preserving T2 commits.

### 2026-11-21 · T2 · done
Added read-only PR/main CI with frontend quality and fail-fast-disabled macOS/Windows/Ubuntu native compilation matrix. Action refs were checked against GitHub; actionlint and workflow formatting pass. Windows/Linux CI has not run remotely.
Passed all plan checks, plus fresh-source frozen install, build, infrastructure tests, and `pnpm tauri build --no-bundle --ci`.
Built unsigned macOS app: `src-tauri/target/release/bundle/macos/Blinkr.app` (9.58 MiB). Its native process started without Vite. Manually launch with `open -n src-tauri/target/release/bundle/macos/Blinkr.app`, then resize normally using the window controls.

### 2026-11-22 · Phase 1 · review cycle 1
Pass 1 (T1): The scaffold and its Vite/Tauri path contract are coherent, but the empty shell inherits Tauri's broad default core permission set rather than being least-privilege.
Pass 2 (T2): T2’s CI workflow and developer documentation meet the specified native/frontend command contracts and align with the scaffold’s scripts, toolchain, and Tauri paths. No correctness defects found in this slice.
Seams pass: The scaffold and CI/documentation tasks agree on commands, tool versions, lockfiles, and the Tauri/Vite build contract. No seam defects found.

Dropped by the verifier:
- F1 · P1 · Empty shell receives unnecessary default Tauri core permissions — src-tauri/tauri.conf.json:12 (`src-tauri/tauri.conf.json:21` has no selected capabilities and no capability files exist, so Tauri's generated `capabilities.json` is `{}` rather than a capability granting `core:default`; the alleged frontend API access cannot occur.)

Spec check:
- missing: "Use no native privileges beyond those needed by this empty shell." (src-tauri/tauri.conf.json) — The configuration supplies no least-privilege capability, so Tauri defaults remain available.
- extra: "These are the only files this task writes." (.gitignore) — This slice also changes Nexus-plan ignore rules. It is unrelated to the requested CI and README work, but does not introduce a demonstrated runtime defect.
- unverifiable: "Validate the workflow YAML and, where available, actionlint" and run the remote native matrix (.github/workflows/ci.yml) — The packet reports local actionlint validation, while GitHub-hosted macOS/Windows/Linux execution remains correctly documented as unverified and cannot be established from this diff.

Declined to judge:
- Generated icon variants and lockfile package internals — They are generated dependency/assets data; configured assets and manifest-to-lock consistency were checked.
- Native window visibility and resize interaction — The packet supplies process-start evidence but no inspectable desktop-session evidence; runtime behavior is outside this code-only pass.
- README command descriptions and prose style — Documentation wording is clear and command paths were checked against the scaffold; no behavioral defect found.
- Implementation-level frontend, Rust, icon, and styling behavior — This seams pass is limited to disagreements between task boundaries.

Checked:
- Vite/Tauri build and development path contract — vite.config.ts; src-tauri/tauri.conf.json; tests/infrastructure.test.mjs: The fixed port, loopback host, dev URL, and resolved production output directory agree.
- Referenced desktop assets — src-tauri/tauri.conf.json; src-tauri/icons/: Every configured PNG, ICNS, and ICO asset is present.
- Native permission boundary — src-tauri/tauri.conf.json; generated Tauri ACL manifest: No explicit capability constrains the default core permission set.
- Rust dependency pin compatibility — src-tauri/Cargo.toml; src-tauri/Cargo.lock: The locked Tauri 2.12.7 and tauri-build 2.7.6 versions match the exact manifest constraints.
- Changed CI command contract — .github/workflows/ci.yml and package.json: Frontend and native jobs run the required frozen install, quality checks, build, tests, locked Cargo checks, and real no-bundle Tauri compilation.
- Cross-platform shell behavior — .github/workflows/ci.yml: The pnpm-store output step uses bash on Unix and explicit PowerShell on Windows; remaining commands are shell-portable.
- Build-path and asset ordering — .github/workflows/ci.yml, README.md, and src-tauri/tauri.conf.json: Native jobs build dist before infrastructure tests and Rust/Tauri operations; documented paths match frontendDist ../dist and the configured Tauri build commands.
- Pinned-tool consistency — .github/workflows/ci.yml, README.md, package.json, and rust-toolchain.toml: Node 24.15.0, pnpm 9.15.9, and Rust 1.99.1 agree across the workflow, documentation, and committed project pins.
- Unsigned production bundle guidance — README.md and src-tauri/tauri.conf.json: The documented macOS app location and launch command match the configured product and normal Tauri bundle output; unsigned limitations and unverified remote matrix status are stated.
- Tauri/Vite command and output-path contract — package.json, vite.config.ts, src-tauri/tauri.conf.json, tests/infrastructure.test.mjs: The scripts and configuration consistently use port 1420, pnpm build, and dist/ via ../dist; the infrastructure tests assert the relevant endpoint and output-directory agreement.
- CI-to-local command contract — .github/workflows/ci.yml, package.json, README.md: CI invokes the documented pnpm quality/build/test commands and matching Rust checks; native compilation uses the exposed Tauri CLI.
- Toolchain and dependency lock agreement — .node-version, package.json, rust-toolchain.toml, src-tauri/Cargo.toml, pnpm-lock.yaml, src-tauri/Cargo.lock, .github/workflows/ci.yml: Node 24.15.0, pnpm 9.15.9, and Rust 1.99.1 agree across local configuration, documentation, and CI; both dependency lockfiles contain the configured packages.

### 2026-11-21 · Final report

T1 completed as `2e337c373e780b300ecd86cf067b71ede66fef5b` (`chore(infra): scaffold the desktop application`). It added the React/Vite and Tauri scaffold, pinned toolchains and locks, desktop assets, and infrastructure tests. Frozen install, formatting, lint, typecheck, frontend build and tests, Rust formatting/Clippy/tests, and no-bundle Tauri build passed. The development app started with Vite; the production macOS app was built and its native process started.

T2 completed as `c324e28538c79266808fe500bdefbc3ffba24bbe` (`chore(ci): T2 add native CI, document setup, and verify production launch`). It added read-only frontend CI and a macOS/Windows/Linux native compilation matrix, plus setup and build documentation. Workflow validation, actionlint, action reference checks, fresh-source frozen install, frontend checks/build/tests, Rust checks, and no-bundle Tauri build passed. The unsigned macOS app was built and its native process started without Vite.

Integration initially failed while staging the runner-managed plan. The `.gitignore` rules were adjusted in `6df5685` to allow versioned plan files while continuing to ignore local Nexus state; the task integrations then completed. This was the only implementation deviation.

Visual inspection of the desktop window and resizing was not completed: macOS denied accessibility automation (`osascript is not allowed assistive access`, `-25211`). Process startup was verified, but rendering and resize behavior remain open. Windows/Linux builds and remote CI execution also remain unverified. The T1 and T2 reports both recorded this visual-inspection limitation.

The review cycle found no unfixed findings. F1, alleging unnecessary Tauri core permissions, was dropped by verification because no capabilities are selected or declared and the generated capabilities manifest is empty. No work was skipped beyond the visual and cross-platform/remote verification noted above; there are no other open questions.

### 2026-11-21 · Landed
Squash-merge of `chore/tauri-infra` into `main` as `docs(plans): add final run report`, authored as Jeremy Asuncion.
