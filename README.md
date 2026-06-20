# Interface Simulator

A desktop app for testing an IT↔PLC interface over OPC UA. Connect to any OPC UA server, browse its address space, define tags by drag-and-drop, build a step-based test sequence against them, and run it with live pass/fail results - without needing the real upstream IT system to exist yet.

Built and tested against a Siemens S7-1500, but the app talks plain OPC UA - it doesn't assume any particular PLC vendor.

<img width="1163" height="342" alt="image" src="https://github.com/user-attachments/assets/65b7a340-28fa-4d49-b0ca-6d2b8910d9e4" />

<img width="1581" height="793" alt="image" src="https://github.com/user-attachments/assets/1d3e17e3-3ea8-499d-b19d-293e149cd2b7" />


<img width="1585" height="988" alt="image" src="https://github.com/user-attachments/assets/a2c3f814-21c0-4024-8c03-a0d4f2bcba18" />


## Features

- **Connection config** - endpoint URL, security policy/mode, anonymous or username/password auth
- **Certificate trust UX** - guided reject → trust → retry flow for secure (Sign/SignAndEncrypt) connections, plus exporting the client's own certificate to hand to whoever administers the PLC
- **Address space browser** - lazy, one-level-at-a-time tree browsing
- **Tags panel** - drag a `Variable` node from the tree to define a named tag, with a live value preview
- **Signal flow / test sequence** - drag-and-drop or dropdown-driven steps:
  - **Write** a value to a tag
  - **Wait/Assert** until a condition is true (optionally two conditions combined with AND/OR, each compared against a constant or another tag's live value, with an optional timeout or none at all)
  - **Delay** for a fixed duration
- **Run engine** - live per-step results, a scrolling log, cancellation, and an optional "loop until stopped" mode
- **Projects** - save/open a connection + tags + sequence as a single `.ifsim.json` file (passwords are never written to disk)

## Requirements

- Node.js 22+
- Windows, macOS, or Linux (packaging configured for Windows NSIS, Linux AppImage, macOS dmg)

## Getting started

```bash
npm install
npm run dev
```

This launches the app with hot-reload via `electron-vite`.

## Testing

```bash
npm run test        # Vitest - spins up throwaway local OPC UA servers to exercise real connect/browse/run logic
npm run typecheck    # TypeScript, main + renderer
```

## Building a package

```bash
npm run dist:dir     # unpacked build, for quick local testing -> release/win-unpacked/
npm run dist         # full installer (NSIS on Windows) -> release/
```

## Project structure

```
src/
  main/        # Electron main process: OPC UA client, certificates, run engine, project file I/O, IPC handlers
  preload/     # contextBridge - the only thing exposed to the renderer
  renderer/    # React UI (one feature folder per concern: connection, certificates, browse-tree, tags, sequence, run, project)
  shared/      # types shared between main and renderer (the IPC contract + data models)
tests/unit/    # Vitest specs covering the main-process logic end-to-end
scripts/       # one-off build asset generator (app icon)
```

## Notes

- The OPC UA client's certificate/private key live under the OS user data directory, not inside the app install or any project file - they're machine-scoped, not project-scoped.
- Saved `.ifsim.json` projects are plain JSON (diffable, git-friendly) but will contain your endpoint URL and tag names - avoid committing real project files to a shared/public repo.
