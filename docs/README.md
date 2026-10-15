# Documentation

A free visual programming language that clones LabVIEW 2026 Q3: you place
blocks on a canvas, wire them together, and the program is the resulting graph.
Each program is saved in a `.sdg` file and compiled to WebAssembly.

## How to read this

| Folder | What it holds | Status |
|--------|---------------|--------|
| [`spec/`](spec/) | **What the language is and how it behaves**: binding on the implementation | **Normative** |
| [`schema/`](schema/) | JSON schemas and data tables: the block catalog, the `.sdg` format and the LabVIEW inventory | **Normative and executable** |
| [`design/`](design/) | **How it is implemented**: the technical decisions and the work plan | Non-normative |
| [`reference/`](reference/) | What is consulted, not obeyed: how LabVIEW is captured, what was measured on it, and the project's history | Informative |
| [`ideas/`](ideas/) | Parked ideas, with no commitment to build them | Informative |

**Normative** text binds and has something that fails when it is broken;
informative text explains.

## Where to start

1. [`design/labview-plan.md`](design/labview-plan.md): where we are (§2) and
   what comes next (§3b).
2. [`spec/01-glossary.md`](spec/01-glossary.md): the vocabulary. *Port*,
   *terminal* or *VI* have a precise meaning here.
3. [`design/05-decisions.md`](design/05-decisions.md): the technical
   decisions, from DT-035 on.
4. Whichever `spec/` document you are working on.

## The rule that governs this documentation

> **Every statement about behavior comes with something that fails when it is
> broken** —a test, a validated schema, a measurement in LabVIEW— **or is
> explicitly marked as unverified.**

And when the specification and LabVIEW disagree, LabVIEW wins and the
specification is corrected.

## The documents

### Specification

| Doc | Contents |
|-----|----------|
| [`spec/01-glossary.md`](spec/01-glossary.md) | Vocabulary and scope |
| [`spec/02-syntax.md`](spec/02-syntax.md) | The `.sdg` format (JSON); its schema is [`schema/qvi.schema.json`](schema/qvi.schema.json) |
| [`spec/03-static-semantics.md`](spec/03-static-semantics.md) | Types, ports, connection rules and cycles |
| [`spec/04-dynamic-semantics.md`](spec/04-dynamic-semantics.md) | Execution, structures and edge cases, measured in LabVIEW; catalog in [`schema/blocks.json`](schema/blocks.json) |
| [`spec/05-editor.md`](spec/05-editor.md) | Editor interaction: selection, wires, palettes, menus, keyboard |
| [`spec/06-visual.md`](spec/06-visual.md) | Visual identity |
| [`spec/07-parity.md`](spec/07-parity.md) | The parity contract with LabVIEW |

### Design

| Doc | Contents |
|-----|----------|
| [`design/labview-plan.md`](design/labview-plan.md) | The living plan: cloning LabVIEW module by module |
| [`design/05-decisions.md`](design/05-decisions.md) | The technical decisions (DT-035 on) |
| [`design/real-programs-0.2.md`](design/real-programs-0.2.md) | Three real programs written with 0.2.1-alpha and what they found (step 3 of the road to the maintainable version) |

### Reference

| Doc | Contents |
|-----|----------|
| [`reference/capturing-labview.md`](reference/capturing-labview.md) | How LabVIEW is measured in the virtual machine |
| [`reference/labview.md`](reference/labview.md) | How LabVIEW works inside |
| [`reference/labview-errors.md`](reference/labview-errors.md) | The error cluster, measured in LabVIEW |
| [`reference/history/`](reference/history/) | The audit of the previous project, Telekino, written in Red, and the migration plan: they explain where some decisions come from; they are not a source of truth |

## Known debts

- `design/` has no architecture, execution or security documents yet; what has
  been decided lives in the DTs of `05-decisions.md`.
- The code (identifiers, comments and messages) is in Spanish; new code is
  written in English.
