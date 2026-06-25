# Interface Simulator

A desktop app for testing an IT↔PLC interface over OPC UA. Connect to any OPC UA server, browse its address space, define tags by drag-and-drop, build a step-based test sequence against them, and run it with live pass/fail results - without needing the real upstream IT system to exist yet.

Built and tested against a Siemens S7-1500, but the app talks plain OPC UA - it doesn't assume any particular PLC vendor.

<img width="1163" height="342" alt="image" src="https://github.com/user-attachments/assets/65b7a340-28fa-4d49-b0ca-6d2b8910d9e4" />

<img width="1581" height="793" alt="image" src="https://github.com/user-attachments/assets/1d3e17e3-3ea8-499d-b19d-293e149cd2b7" />


<img width="1585" height="988" alt="image" src="https://github.com/user-attachments/assets/a2c3f814-21c0-4024-8c03-a0d4f2bcba18" />

<img width="610" height="457" alt="image" src="https://github.com/user-attachments/assets/13f57e7f-98e1-4c53-bff8-df7d257c834d" />

## Features

- **Connection config** - endpoint URL, security policy/mode, anonymous or username/password auth
- **Certificate trust UX** - guided reject → trust → retry flow for secure (Sign/SignAndEncrypt) connections, plus exporting the client's own certificate to hand to whoever administers the PLC
- **Address space browser** - lazy, one-level-at-a-time tree browsing
- **Tags panel** - drag a `Variable` node from the tree to define a named tag, with a live value preview
- **Methods panel** - drag a `Method` node from the tree to define a callable method, reading its declared input/output arguments from the server; a "Test call…" button lets you invoke it manually with literal inputs and see its decoded outputs, without building a sequence
- **Signal flow / test sequence** - drag-and-drop or dropdown-driven steps:
  - **Write** a value to a tag, sourced from a constant, another tag's live value, or a prior Call Method step's captured output
  - **Wait/Assert** until a condition is true (optionally two conditions combined with AND/OR). Each condition's subject can be a tag's live value or a method, re-invoked on every poll just like a tag is re-read (e.g. "wait until getMachineSpeed() returns >= 100" with no tag involved at all), compared against a constant, another tag's live value, a prior Call Method step's captured output, or - the "changed" comparison - simply waiting for the subject's value to differ from what it was when the step started, with an optional timeout or none at all
  - **Call Method** - invoke an OPC UA method with input arguments sourced from a constant, a tag, or a prior Call Method step's captured output, and capture its output arguments for later steps to use. This models the Siemens "PLC as requester" message-buffer handshake (PLC increments a sequence tag → Wait/Assert "changed" detects it → Call Method reads the request → Call Method echoes a response built from that output) - see Siemens Entry-ID 109795979 for the reference pattern.
  - **Delay** for a fixed duration
- **Run engine** - live per-step results, a scrolling log, cancellation, and an optional "loop until stopped" mode
- **Projects** - save/open a connection + tags + methods + sequence as a single `.ifsim.json` file (passwords are never written to disk)

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
  renderer/    # React UI (one feature folder per concern: connection, certificates, browse-tree, tags, methods, sequence, run, project)
  shared/      # types shared between main and renderer (the IPC contract + data models)
tests/unit/    # Vitest specs covering the main-process logic end-to-end
scripts/       # one-off build asset generator (app icon)
```

## Notes

- The OPC UA client's certificate/private key live under the OS user data directory, not inside the app install or any project file - they're machine-scoped, not project-scoped.
- Method arguments are supported for builtin scalar types (Boolean/Int*/UInt*/Float/Double/String/DateTime/ByteString/Guid). Custom/structured (UDT) or array-valued arguments are shown but not editable as a constant in this version.
- A structured/array value - a method output, or a tag itself (e.g. an array-of-structs "Alarms" tag) - can still be used elsewhere: when sourcing a value from it, an optional path (e.g. `chamberState.actValue`, or `3.value` for the 4th array element's value field) drills into one field/element - leave it blank to pass the whole value through untouched (needed for the PLC-requester pattern, where a structured "envelope" output is fed straight into another method's input of the same type).
- Saved `.ifsim.json` projects are plain JSON (diffable, git-friendly) but will contain your endpoint URL and tag names - avoid committing real project files to a shared/public repo.
