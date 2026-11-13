# Luma Photobooth Studio

An offline-first Windows Electron application with a custom frame designer, webcam capture sessions, a digiCamControl DSLR bridge, session history, and native Windows print submission. Hardware DSLR/printer validation, event profiles, and kiosk mode remain future work.

## Capture, mirror, and print

Open **Start Photobooth** or **Camera Settings**, select your camera source, and connect. **Mirror camera** switches between normal and horizontally mirrored live preview and captured photographs. Frame graphics and text remain unchanged. The untouched original camera files are retained. Use **Save settings** to remember your choice; the switch is locked during an active session.

Sessions capture each distinct visible photo-slot number, preserve originals, and render the completed frame. Completed sessions support retakes, PNG/PDF export, printing, and reprinting from **Photo Sessions** or **Print Manager**. Select an installed printer and the number of copies; automatic printing is optional. “Submitted” means Windows accepted the job, not that physical printing was confirmed.

The DSLR bridge requires digiCamControl running locally with its webserver enabled on port 5513, web interaction allowed, a supported camera connected, and JPEG capture enabled. Demo Mode is explicitly synthetic. Compatibility is model-specific; see the [digiCamControl camera list](https://www.digicamcontrol.com/cameras) and [web interface documentation](https://www.digicamcontrol.com/doc/userguide/web).

## Run

Requires Node.js 22.12+ (Node 24 recommended).

```powershell
npm.cmd install
npm.cmd run dev
```

The desktop window starts automatically. In PowerShell, `.cmd` avoids the system's npm.ps1 execution-policy restriction. `npm run dev:web` is a UI-only browser preview; filesystem operations require Electron.

```powershell
npm.cmd run build
npm.cmd start
npm.cmd test
npm.cmd run test:desktop
npm.cmd run test:desktop -- --dev
```

## First workflow

1. Start in **Frame Designer**, with an editable four-photo layout.
2. **Upload your frame** or drop a transparent PNG on the upload area. It becomes a front overlay. Use **Background** for an image behind the photos. Uploads fit proportionally within the paper.
3. Select photo slots on the canvas or Layers list. Drag, resize, rotate, or enter exact pixel coordinates in Properties. **Photo placeholder** adds another slot beneath the first overlay. Shift-click selects multiple objects. The layer list is front-to-back.
4. Use **Load sample photos** and select up to 20 PNG/JPEG photographs. They map to distinct capture numbers in ascending order. Select a particular slot and use **Replace image** to change only that photo. Replacing a frame image also preserves its existing rectangle and all photo positions.
5. Name and **Save template**. Open it again in **Frame Library**. Use the copy icon beside paper dimensions for Save As. The library includes portrait, strip, and landscape starters.
6. Use **Preview**, then **Export print PNG**. Every visible photo slot must have a sample. Export uses full-size assets, exact saved pixel dimensions, and embedded 300 DPI by default. A 4 × 6 portrait output is 1200 × 1800 pixels.
7. **Export template** creates a portable editable JSON package including assets. Import it from Frame Library.

Ctrl+S saves; Ctrl+Z/Y undoes/redoes; Ctrl+D duplicates; Ctrl+C/V copies/pastes; arrows move one pixel, Shift+arrows ten. Delete removes unlocked selected objects. The help icon lists shortcuts.

## Persistence and limits

SQLite and managed images live under `%APPDATA%/luma-photobooth/studio` (the exact parent uses Electron's userData path). Export locations are selected through native dialogs. Templates save explicitly; unsaved edits are not autosaved. Imported images are restricted to PNG/JPEG, 40 MB, and 60 megapixels. Output is limited to 36 megapixels. Asset garbage collection and low-resolution preview caching remain future optimizations.

Sample layouts contain placeholders, not sample photography. Supply your own photographs; no network access or stock image service is needed. Photo slots are never inferred from transparency. Text uses single-line Arial; font metrics may differ slightly between canvas preview and Sharp export. Photo placement, crop, rotation, masks, and borders share the same geometry contract.

## Packaging

Run `npm.cmd run package:win` from the project folder to build the Windows NSIS installer. The output is `release/Luma Photobooth Setup 0.1.0.exe`; double-click it to install the desktop app. The installer bundles the runtime, so users do not need Node.js or npm to run the installed app. DSLR use still requires the separate digiCamControl setup described above.

`release/win-unpacked/Luma Photobooth.exe` runs the packaged app without installing, but it needs the entire `win-unpacked` folder beside it. Share the Setup EXE for installation. The build is unsigned; code signing and physical camera/printer qualification remain production tasks. Building requires dependencies and packaging tools to be downloaded first.

See [architecture and phase plan](docs/ARCHITECTURE.md). Tests verify print pixel bounds, 300 DPI metadata, crop anchors, overlay transparency, rotation, rounded masks, borders, duplicate strips, schema rejection, and SQLite reopening.

## Verified milestone

- Strict TypeScript and production build passed.
- Sixteen automated composition, storage, session, mirror, print-queue, and DSLR protocol tests passed.
- `npm.cmd run test:capture` verifies demo/test-webcam capture, mirror preview and persistence, retakes, cancellation, exact PDF paper size, and print submission/failure handling. It simulates native printer callbacks and does not physically print.
- Electron end-to-end workflow passed in production and Vite development modes: transparent frame import, four synthetic sample PNGs, SQLite save/reload, editable package export/import with remapped assets, numeric slot editing, and 1200 × 1800 output with 300 DPI metadata.
- Desktop screenshot inspected. Test artifacts are written under `artifacts/desktop-smoke/` and excluded from Git.
- At installation, npm audit reported six moderate advisories in the packaging toolchain and no high or critical advisories. Installer packaging and physical camera/printer behavior are not validated by these tests.
