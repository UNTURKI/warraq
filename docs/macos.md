# macOS support (draft)

The macOS build is experimental. Windows packaging is unchanged.

## Development

Install Node.js, then run from the repository root on a Mac:

```sh
npm install
npm run fonts
npm start
```

## Build

```sh
npm run dist:mac
```

This produces separate Apple Silicon (`arm64`) and Intel (`x64`) DMG and ZIP artifacts in `dist/`.
For local unsigned builds, run `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac`.
Public distribution still needs a Developer ID certificate and Apple notarization configured with electron-builder; neither is supplied by this draft. Unsigned builds may be blocked by Gatekeeper.

## Behavior

- Finder opens `.waraq`, `.warraq`, and `.wqmod` files through the existing import handlers.
- `warraq://` links received during startup wait until the main interface is ready.
- Closing the main window leaves the app running; clicking its Dock icon reopens it.
- The main window uses a native title bar, and the application menu provides standard macOS actions.
- Update checks open the releases page. They never download or execute the Windows installer; automatic macOS updates are not implemented.
- Windows Explorer context-menu actions remain Windows-only.

## Validation

```sh
node --test app/test/macos-tests.cjs
```

Before calling this supported, test packaged builds on both architectures: cold/warm Finder opens and protocol links, close/reopen from the Dock, Cmd shortcuts, bundled/system Arabic fonts, PDF and Word imports/exports, local Shamela imports, and lesson playback/sign-in. Also verify signed/notarized installation on a clean Mac.
