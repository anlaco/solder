# Examples

Three typical acquisition and control programs. They are the yardstick of the road to the maintainable
version (plan, "Road to a maintainable version", step 3): **nothing else is implemented until each one
behaves in Solder exactly as in LabVIEW 2026 Q3** (rule decided on 2026-10-10).

Each example is written as a LabVIEW user would write it, without workarounds, and with deterministic
inputs (no Random Number) so that the outputs can be compared value by value. The LabVIEW versions were
built in the virtual machine on 2026-10-09/10 (`Desktop\solder'examples`); the outputs below were read
from them and are the reference.

> **Status (2026-10-10):** the `.sdg` files in these folders (`.qvi` before DT-051) are still the first Solder versions of
> 2026-10-09, with workarounds and Random Number ([`real-programs-0.2.md`](../docs/design/real-programs-0.2.md)).
> They are rewritten to match the descriptions below once Solder can (step 3 of the rule).

LabVIEW setting used for the reference: *Tools ▸ Options ▸ Front Panel ▸ Use localized decimal point* is
**off**. With it on, as in a fresh install on a Spanish Windows, Format Into String writes `5,0000` and
numbers are shown with a comma.

## 1. Temperature Monitor

**Read Sensor** (subVI): `Sample` (DBL control) → Expression Node `20+5*sin(x/10)` → `Temperature` (DBL
indicator). Connector 4-2-2-4: `Sample` left, second row; `Temperature` right, second row.

**Temperature Monitor**: a While Loop. Each iteration: `i` → Read Sensor → Waveform Chart `Temperature`;
`Greater?` (temperature, `High limit`) → Round LED `Alarm`; a shift register initialized to 0 accumulates
the sum and `Average` = sum / (i + 1); `Wait Until Next ms Multiple` (`Period (ms)`). The loop stops when
`Stop` OR (i + 1) ≥ `Samples`. Defaults: Period 100, High limit 24, Samples 100.

| Output after a run | LabVIEW |
|--------------------|---------|
| Iterations | 100 (i = 0…99), about 10 s |
| Average | 20.9324 (exactly 20.932369884762963) |
| Alarm at the end | FALSE (last temperature 17.7123) |
| Chart | the 100 values of 20 + 5·sin(i/10), from 15.0004 to 24.9979; Y autoscale shows 14 to 26 in steps of 2 |
| Chart history | kept between runs: a second run continues the X axis (589–689 after earlier runs) |

## 2. Instrument Protocol

**Simulated Instrument** (subVI): `Command` (string control) → Case Structure with a **string selector**:
`"*IDN?"` → `SOLDER,SIM-1,0,0.2`; `"MEAS:VOLT?"` → Format Into String `%.4f` of the DBL constant 5;
`Default` → `ERR unknown command`. Output `Reply` (string indicator). Connector: `Command` left and
`Reply` right, second row.

**Parse Reply** (subVI): `Reply` (string), `error in` → Scan From String `%f` → `Value` (DBL), `error out`.
Connector: `Reply` left top, `error in` left bottom, `Value` right top, `error out` right bottom.

**Instrument Protocol**: before the loop, `"*IDN?"` → Simulated Instrument → `Identification`. A While
Loop: `Command` → Simulated Instrument → Parse Reply, whose error goes round a shift register (not
initialized); `Value` → Waveform Chart `Voltage`; Unbundle By Name `status` of the error OR `Stop` → loop
condition; Wait (ms) 100. After the loop: Simple Error Handler → `error out`. Default Command:
`MEAS:VOLT?`.

| Case | LabVIEW |
|------|---------|
| Identification | `SOLDER,SIM-1,0,0.2` |
| Command `MEAS:VOLT?` | every iteration plots 5; runs until Stop; the Y autoscale of a constant 5 shows 4.4 to 5.6; after Stop, `error out` has no error and no dialog appears |
| Command `FOO` | one iteration: Scan From String fails, the chart gets one point 0 (Scan's default) after the history of the previous run, the loop stops |
| Dialog of `FOO` | "Error 85 occurred at Scan From String (arg 1) in Parse Reply.vi->Instrument Protocol.vi", "Possible reason(s):", "LabVIEW: (Hex 0x55) Scan failed. The input string does not contain data in the expected format.", button **Continue**, link "Search ni.com for error" (texts read to compare, not to copy) |
| `error out` of `FOO` | status TRUE, code 85, source `Scan From String (arg 1) in Parse Reply.vi->Instrument Protocol.vi` |

## 3. Oven Controller

A state machine: a While Loop with three shift registers. The state is an **enum** `Init, Heat, Hold,
Cool, Done` initialized to `Init`; the temperature, a DBL initialized to 20; the hold counter, an I32
initialized to 0. A Case Structure on the state (frames `"Init", Default`, `"Heat"`, `"Hold"`, `"Cool"`,
`"Done"`):

| Frame | Next state | Temperature | Counter | Heater / Fan |
|-------|-----------|-------------|---------|--------------|
| Init | Heat | 20 | 0 | default (FALSE) |
| Heat | Hold if temperature + 1.5 ≥ `Setpoint`, else Heat | + 1.5 | unchanged | TRUE / default |
| Hold | Cool if counter + 1 ≥ 20, else Hold | unchanged | + 1 | TRUE / default |
| Cool | Done if temperature − 2 ≤ 25, else Cool | − 2 | unchanged | default / TRUE |
| Done | Done | unchanged | unchanged | default |

Heater and Fan leave through tunnels with *Use Default If Unwired*. Outside the Case: the temperature →
Waveform Chart `Temperature`; the next state → enum indicator `State` (made with Create ▸ Indicator on the
wire); `Equal?` (next state, `Done`) OR `Stop` → loop condition; Wait (ms) 100. Default Setpoint: 60.

| Output after a run | LabVIEW |
|--------------------|---------|
| Iterations | 66: Init 1, Heat 27, Hold 20, Cool 18 |
| Chart | 20, 21.5, 23 … 60.5; twenty times 60.5; 58.5 … 24.5. Y autoscale shows 20 to 70 |
| At the end | State `Done`, Heater FALSE, Fan TRUE |
