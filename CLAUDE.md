# Context for Claude Code

A free visual programming language that clones LabVIEW 2026 Q3. The core
(`nucleo/`) compiles the diagram to WebAssembly; the editor (`editor/`) is a
web page in Electron. Everything is JavaScript; Rust only for the future
hardware host.

## Language

**We work in English**: conversation, documentation, commit messages and new
code (identifiers, comments, messages). The existing code is in Spanish and is
not translated wholesale; when you touch a piece of it, follow the surrounding
code unless the task is to rename it.

## Starting a session

When the developer says "continue" (or "sigue"): read
[`docs/design/labview-plan.md`](docs/design/labview-plan.md) §0, §2 and §3b,
and pick up the first item not done. The rest of the docs are indexed in
[`docs/README.md`](docs/README.md).

## Rules

1. **Clone LabVIEW 2026 Q3, one to one** (DT-035): windows, palettes, menus,
   names, order and behavior. What is not done yet looks the same, greyed out,
   and says why.
2. **Nothing that has not been seen or tried in LabVIEW is written from
   memory.** Measure it in the virtual machine
   ([`docs/reference/capturing-labview.md`](docs/reference/capturing-labview.md)).
   When the specification and LabVIEW disagree, LabVIEW wins and the
   specification is corrected without asking.
3. **Never copy NI bitmaps or texts.** The captures in `labview-captures/` are
   local evidence and are never committed; icons are drawn and help texts are
   written anew.
4. **Everything compiles to pure WebAssembly** (DT-039), with our own encoder
   and no interpreter. The `.qvi` file stores only the diagram.
5. **Every statement about behavior comes with something that fails when it is
   broken** (a test, a schema or a measurement) or is marked "unverified".
6. **Tests green** after every change: `npm test` in `editor/` (core and
   editor). The test "las ramas independientes…" is sensitive to load: if it
   fails, run it again on its own.
7. A decision that is not written down is proposed and asked about before going
   on; it is recorded as a DT in
   [`docs/design/05-decisions.md`](docs/design/05-decisions.md).
8. **Commit only when asked**, with clear messages and no co-author lines.

## How we work

- Architecture and the core are done in the main session. LabVIEW capture and
  editor work are delegated to Sonnet subagents.
- When a plan step is done: tests green, mark it in the plan with the date, and
  update its §2.

## Commands

```bash
cd editor && npm test                     # tests
cd editor && npm run app                  # the editor
node --experimental-wasm-jspi nucleo/cli.mjs run|wat|check file.qvi
```
