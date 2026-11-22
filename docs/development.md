# Developing Blinkr

Blinkr is a [Tauri](https://tauri.app) v2 app with a React frontend and a Rust backend.

## Pinned tools

- **Node.js:** 24.15.0
- **pnpm:** 9.15.9
- **Rust:** 1.99.1, including `rustfmt` and Clippy

Install the pinned pnpm version with Corepack after installing Node:

```sh
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

For Rust, use [rustup](https://rustup.rs/). The committed `rust-toolchain.toml` selects the
same toolchain for this repository.

```sh
rustup toolchain install 1.99.1 --profile minimal --component rustfmt --component clippy
```

## Platform prerequisites

- **macOS:** Xcode command-line tools (`xcode-select --install`).
- **Windows:** Microsoft C++ Build Tools with the MSVC toolchain and Windows SDK, plus the
  [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
- **Ubuntu/Debian Linux:**

  ```sh
  sudo apt-get update
  sudo apt-get install --yes \
    build-essential file libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev \
    libayatana-appindicator3-dev librsvg2-dev libxdo-dev pkg-config
  ```

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for details.

## Install and run

```sh
pnpm install --frozen-lockfile
pnpm dev           # frontend only, at http://localhost:1420
pnpm desktop:dev   # Vite plus the native Tauri window
```

Port 1420 is fixed and strict, so stop any other session using it first. Native builds
only target the host platform: build Windows on Windows, macOS on macOS, and Linux on Linux.

## Checks

These match CI. Run `pnpm build` before `pnpm test` or the Cargo commands, because both
read the built `dist` folder.

```sh
pnpm format:check   # pnpm format applies fixes
pnpm lint
pnpm typecheck
pnpm build
pnpm test

cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

## Builds

```sh
pnpm tauri build --no-bundle --ci      # native compile, no installer
pnpm tauri build --bundles app --ci    # macOS .app bundle
pnpm desktop:build                     # default platform installers
```

Output lands under `src-tauri/target/release/bundle/`. Builds are not code-signed. macOS
builds are ad-hoc signed, so Gatekeeper shows an unverified-developer warning instead of
calling the app damaged.

## Release

The Release workflow runs after CI passes on `main`, and can also be started by hand from
the Actions tab. It builds a universal macOS DMG, a Windows installer and portable exe, and
a Linux AppImage and deb. It then replaces the rolling `latest` GitHub Release and its tag.

## Lockfiles

`pnpm-lock.yaml` and `src-tauri/Cargo.lock` are part of the reproducible build. Keep them
committed, use `--frozen-lockfile` for pnpm and `--locked` for Cargo, and only update them
when intentionally changing dependencies.

## Native permissions

The main window's permissions live in `src-tauri/capabilities/main.json`. They cover window
modes (always on top, decorations, fullscreen, dragging), global-shortcut registration, and
the settings store. The app has no network access, and its content security policy is strict.

## Known limits

- **Throttling:** the app asks the webview not to throttle timers while hidden, which only
  works on macOS 14 and later. Scheduling uses absolute deadlines, so flashes stay on time
  everywhere else too.
- **Tests use mocks** for Tauri dragging, fullscreen, and hotkey registration.
- **Wayland** behavior, including the global hotkey, has not been verified.
