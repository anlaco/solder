# Idea — FPGA target with Yosys

> Status: **SHELVED** · Date: 2026-09-29
>
> This is an idea, not a commitment. It does not go into `spec/` or `design/`
> and nobody works on it until Solder works as an acquisition and control tool.

## Origin

After programming an NI Ethernet RIO with LabVIEW FPGA: the dataflow diagram
translates very naturally to hardware (node = logic, wire = wire). Could Solder
do the same with free tools?

## What it would look like

```
Diagrama → Verilog (generado por Solder) → Yosys → nextpnr → bitstream → placa
```

- Yosys + nextpnr cover Lattice (iCE40, ECP5) and Gowin well. Xilinx 7-series,
  only experimentally.
- **YoWASP** distributes Yosys and nextpnr compiled to WebAssembly: the whole
  chain could run without installing anything.
- It would be a different compilation **target**: same editor, restricted
  palette and another backend.

Differences from the normal target:

| Normal target | FPGA target |
|---|---|
| `f64` | Fixed-width integer / fixed point |
| Dynamic arrays, strings | Fixed size only, no strings |
| While Loop | Loop synchronized with the clock (like a *Single-Cycle Timed Loop*) |
| Shift register | Flip-flop |
| Front Panel | Registers read/written from the host (UART/SPI/Ethernet) |

Candidate boards: Tang Nano 9K (Gowin), iCEBreaker (iCE40), ULX3S /
Colorlight i5 (ECP5). It is **not** suitable for NI hardware (Xilinx +
proprietary loading).

## Why it is shelved

Decided on 2026-09-29: the focus is **acquisition and control**.

- **Situation:** the Rust rewrite is under way, the spec is a draft. The
  architecture (WebAssembly + sandbox + host resources) is built for
  acquisition and control. Opening a second compiler now would repeat the
  failure mode pointed out by `../reference/history/whitelist.md`: decisions
  that never get executed.
- **Market:** the LabVIEW user base is in acquisition and control, and the
  licensing change after Emerson's purchase of NI is pushing people to look for
  alternatives. Visual FPGA is a niche: professionals use HDL/HLS, free tools
  do not cover Xilinx/Intel, and Icestudio (visual + Yosys + iCE40) has spent
  years without getting out of the educational sphere.
- **The value of LabVIEW FPGA is in NI's integrated hardware**, not only in the
  editor.

*(The market data was not verified against sources in that session.)*

## When to pick it up again

As a **complement to the acquisition system**, RIO style: Solder on the PC +
a cheap FPGA as a fast I/O coprocessor.

The only thing done now: **the spec must not prevent having several
compilation targets.**

First spike when the time comes, in `spikes/`: constant diagram → adder →
feedback register → comparator → LED; generate Verilog in Rust and get a
bitstream out of Yosys + nextpnr.
