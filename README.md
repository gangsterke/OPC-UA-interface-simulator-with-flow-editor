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
- **Methods panel** - drag a `Method` node from the tree to define a callable method and test-call it directly; see [Methods](#methods) below
- **Signal flow / test sequence** - drag-and-drop or dropdown-driven steps:
  - **Write** a value to a tag, sourced from a constant, another tag's live value, or a prior Call Method step's captured output
  - **Wait/Assert** until a condition is true (optionally two conditions combined with AND/OR). Each condition's subject can be a tag's live value or a method call, compared against a constant, another tag's live value, a prior Call Method step's captured output, or - the "changed" comparison - simply waiting for the subject's value to differ from what it was when the step started, with an optional timeout or none at all
  - **Call Method** - invoke an OPC UA method as a sequence step; see [Methods](#methods) below
  - **Delay** for a fixed duration
- **Run engine** - live per-step results, a scrolling log, cancellation, and an optional "loop until stopped" mode
- **Projects** - save/open a connection + tags + methods + sequence as a single `.ifsim.json` file (passwords are never written to disk)

## Methods

Methods are OPC UA's RPC-style calls (as opposed to tags, which are just read/written values), and the app treats them as a first-class citizen alongside tags.

### Adding and test-calling a method

Drag a `Method` node from the address-space browser into the **Methods panel** to define it. The app reads its declared input and output arguments straight from the server (names, data types, scalar vs. array) and shows them immediately - no need to call it first to see what it expects.

<img width="407" height="468" alt="image" src="https://github.com/user-attachments/assets/ebd25ffb-5590-4bd2-93d5-e091ca00abf8" />


Each method has a built-in **Call** button right there in the panel: type literal values into its input fields and click Call to invoke it directly against the connected server, with the decoded output shown right below. This is the fastest way to check what a method actually does before wiring it into a sequence.

### Using methods in a test sequence

- **Call Method step** - pick a defined method, supply each input argument, run the call, and capture its outputs for later steps to reference.
- **Wait/Assert step** - a condition's subject isn't limited to a tag. Choose "method call" instead and the method is **re-invoked on every poll**, exactly like a tag is re-read on every poll - e.g. "wait until `getMachineSpeed()` returns >= 100" with no tag involved at all.
- Any input argument (for a Call Method step or a polled Wait/Assert method) can itself be sourced from a constant, a tag's live value, or a prior Call Method step's captured output.

<img width="717" height="222" alt="image" src="https://github.com/user-attachments/assets/b66df227-7373-43c3-8877-79c10455b942" />

### Chaining outputs and drilling into structured values

A method's captured output - or a tag's own live value - can be fed into a later step's Write value, Wait/Assert comparison, or another method's input argument. When that value is a **structured or array value** (e.g. a custom UDT, or an array-of-structs tag like an "Alarms" list), an optional path drills into one specific field or element instead of using the whole thing - for example `chamberState.actValue` for a nested field, or `3.value` for the 4th array element's `value` field. Leave the path blank to pass the whole value through untouched.

This whole-value passthrough is what makes the Siemens **"PLC as requester"** message-buffer handshake (Entry-ID 109795979) straightforward to reproduce: the PLC increments a sequence tag → a Wait/Assert step's "changed" comparison detects it → a Call Method step reads the request envelope → a second Call Method step echoes a response built from that same envelope, with no re-typing of its structure along the way.

### Current limitations (v1)

- Constant input values are supported for builtin scalar types only (Boolean/Int*/UInt*/Float/Double/String/DateTime/ByteString/Guid). A structured or array-valued argument is shown as such but isn't directly editable as a literal - use field-path drilling (above) to get at its individual fields instead.

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
- Saved `.ifsim.json` projects are plain JSON (diffable, git-friendly) but will contain your endpoint URL and tag names - avoid committing real project files to a shared/public repo.
