# The error cluster in LabVIEW — what was measured

> Informative. Describes what was verified in LabVIEW 2026 Q3 Community (Win11 VM,
> 1920 × 1080, 100 %) on 2026-10-02, by building and running throwaway VIs
> (nothing saved). Method: [`capturing-labview.md`](capturing-labview.md).
> Each claim cites its capture (folder `labview-captures/errores/`, outside
> git); what was not tried is marked **unverified**. The rules that come out of
> this are at the end.

## 1. The type

A cluster of **3 elements**, in this order (Context Help over the wire,
`09b-help-cable-recorte.png`):

| # | label | type |
|---|-------|------|
| 1 | `status` | Boolean (TRUE or FALSE) |
| 2 | `code` | **I32** (long, −2147483648 to 2147483647) |
| 3 | `source` | string |

- An Unbundle By Name wired to an error auto-fills with `status` as its
  first element (`08-w.png`); the order above matches that of a full
  Unbundle (the unwired Unbundle comes out with 0 elements, `13.png`; its 3 labeled
  outputs were never seen: **unverified**, the order comes from the Context Help).
- **Error wire in the diagram** (`08-w.png`, measured pixels): **3 px
  thick**; 1 px border above and below `#7f7f00` (olive) and a center row of
  2 px yellow `#ffff00` / 2 px black `#000000` dashes (`YYKK` pattern
  repeated). Data clusters of other types have another color (string pink,
  I32 blue, DBL orange, path teal; `221-select-i32-dbl.png`,
  `33.png`).
- **Terminal of an error control/indicator in the diagram**: 32 × 32 icon
  with a double olive frame and the cluster drawing (pink, orange, green,
  blue bars), with the direction arrow and the label to one side (`03-ctl.png` →
  `08-w.png`). Its default label: `error in (no error)` (control) and
  `error out` (indicator); with several controls they are numbered `... 2`, `... 3`
  (`66.png`).
- **Constant** (Error Cluster Constant): thin olive frame with `F` (green), `0`
  (blue) and an empty pink field (`202.png`). Default value: status FALSE,
  code 0, empty source.
- Element help (`68.png`): over `source` the Context Help says "source
  describes the origin of the error or warning" and points to *Explain Error /
  Explain Warning* in the control's context menu.

## 2. Panel controls

`Error In 3D.ctl` and `Error Out 3D.ctl` were placed (Quick Drop, Ctrl+Space;
Context Help "Error In 3D.ctl" / "Error Out 3D.ctl", `02-qd.png`, `03-ctl.png`).
**Controls ▸ Modern ▸ Array, Matrix & Cluster and other palettes were not
browsed: unverified** whether more variants exist (Classic, Silver, System).

Look (`03-ctl.png`, `18.png`, ×4 crop `18b-error-out-recorte-x4.png`):

- Flat grey with 3D relief. Label at the top left of the control itself
  ("error in (no error)"; "error out" comes out with a black background while it is edited).
- Body of the Error Out: **155 × 121 px** (x 735‥889, y 454‥574; the label
  occupies 437‥452 above). Error In: same body, ≈ 152‥155 px wide.
- Top row: caption `status` and, to its right, caption `code`.
  - `status`: square push button of ~16 px with a **green ✔** when it is FALSE and a
    **red ✘** when it is TRUE (`35.png`, `36-error-in-5000.png`).
  - `code`: numeric field with prefix `d` (I32 representation) and, in the
    control, ▲▼ buttons; in the indicator, the field in grey without buttons.
- Below, caption `source` and a **text box of ~4 lines** with a vertical
  scrollbar (light in the control, grey in the indicator). It admits
  several lines and wraps by words (`41.png`).
- **Default value of the Error In**: status FALSE (✔), code 0, empty source; the
  caption says "(no error)" (`03-ctl.png`).
- Editable on the panel with the automatic tool: one click on the status
  toggles it; double click on `code` and type; click on `source` and type, Ctrl+Enter
  confirms (`35.png`). **Unverified**: the control's context menu (Explain
  Error…), sizes with other fonts.

## 3. Error passing through a function with `error in` / `error out`

Function: **Read from Text File** (File I/O). Terminals (Context Help,
`22.png`): inputs `prompt`, `file (use dialog)`, `count`, `error in`; outputs
`refnum out`, `text`, `cancelled`, `error out`. With `file` = `C:\Windows\win.ini`:

| error in | result | capture |
|----------|--------|---------|
| (F, 0, "") | **does its job**: `text` = first line of the file ("; for 16-bit app…"), `error out` = (F, 0, "") | `34-baseline-sin-error.png` |
| **(T, 5000, "prueba")** | **does NOT do its job**: `text` comes out **empty**; `error out` = **the same error** (T, 5000, "prueba") untouched; no dialog appears (error out wired) | `36-error-in-5000.png` |
| **warning (F, 5000, "prueba")** | **does do its job** (`text` with the line of the file) and `error out` = the same warning (F, 5000, "prueba") | `37-warning-5000.png` |

That is: status TRUE ⇒ the function does not execute and forwards the cluster intact;
status FALSE with code ≠ 0 ⇒ it executes and forwards the warning.

When the function itself produces the error (nonexistent path `C:\noexiste.txt`),
`error out` was (`41-error-real-7.png`, enlarged in `41b-source-x4.png`):
**status TRUE, code 7, source** =
"Read from Text File in Untitled 4<APPEND>" and, on the next line,
`C:\noexiste.txt` (the box splits it into 3 lines: "Read from Text File in" /
"Untitled 4<APPEND>" / "C:\noexiste.txt"). `text` comes out empty. Format of the
source: `<function name> in <VI name>` + marker `<APPEND>` + the
detail (here the path). Whether the line break before the path is `\n` or `\r\n`:
**unverified**.

## 4. Automatic error handling

(`42‥47`, `44-dialogo-error-automatico.png`, `44b-dialogo-x3.png`)

- With the function's `error out` **unwired** and a real error (code 7), on
  running a **modal dialog** appears *with no title text* (bar with the
  LabVIEW icon and the ✕), with:
  - red ✘ icon (circle) and in **bold**: "Error 7 occurred at Read from Text
    File in Untitled 4";
  - in bold "Possible reason(s):";
  - "LabVIEW: (Hex 0x7) File not found. The file might be in a different location
    or deleted. Use the command prompt or the file explorer to verify that the
    path is correct.";
  - a line with the detail source: `C:\noexiste.txt`;
  - link "Search ni.com for error";
  - buttons **Continue** (default) and **Stop**.
- During the dialog the VI is **running** (red Stop button active). With
  *Continue* the VI finishes its execution and goes back to idle (`45.png`); with *Stop*
  it also ends and stays idle (`47.png`). The difference (carrying on with the
  later nodes versus aborting) **could not be seen** because the test VI
  had a single node: **unverified**.
- With `error out` **wired** to an indicator, the same error **raises no
  dialog**: it stays in the cluster (`41-error-real-7.png`).
- **Where it is enabled/disabled**:
  - Per VI: **File ▸ VI Properties** (Ctrl+I) ▸ category **Execution** ▸ checkbox
    **"Enable automatic error handling"**, checked by default
    (`50-vi-properties-execution.png`). Unchecked, the same VI runs without a dialog
    (`51.png`, `52-auto-handling-desmarcado.png`). Categories in the selector:
    General, Memory Usage, Documentation, Revision History, Editor Options,
    Protection, Window Appearance, Window Size, Window Run-Time Position,
    Execution, Print Options.
  - Global: **Tools ▸ Options ▸ Block Diagram ▸ Error Handling**
    (`56-options-block-diagram-errores.png`): "Enable automatic error handling in
    new VIs" ☑, "Enable automatic error handling dialogs" ☑, "Log unwired
    errors" ☐ (with "Log file for current session").
- **Error list** (broken VI): when running a broken VI the
  **Error list** window opens (`75-lista-de-errores-vi-roto.png`): "Items with errors" (the open
  VIs with ✘), "N errors and warnings" with checkbox "Show Warnings", *Details*
  panel, buttons Close / Show Error / Help. See §8.

## 5. Dialog & User Interface, errors

Subpalette **Programming ▸ Dialog & User Interface** (`59-paleta-dialog-ui.png`):
**4 columns**, 23 elements, in this order (names by tooltip):

1. One Button Dialog · Two Button Dialog · Three Button Dialog.vi · **Simple Error Handler.vi**
2. **General Error Handler.vi** · **Clear Errors.vi** · **Error Ring** · **Merge Errors**
3. **Error Cluster From Error Code.vi** · **Find First Error.vi** · **Error Cluster Constant** · Multiple Errors
4. Prompt User for Input · Display Message to User · Write to System Log.vi · Wait For Front Panel Activity
5. Generate Front Panel Activity · Color Box Constant · Listbox Symbol Ring Constant · Events
6. Menu · Cursor · Help

*Explain Error* is not in the palette: it is in **Help ▸ Explain Error…** (§6;
Help menu in `105-menu-help.png`). The error VIs live in
`vi.lib\Utility\error.llb` (Context Help gives the path, `85-clear-errors-ayuda.png`,
`60b-simpleerrorhandler-hover.png`).

Terminals (Context Help; `60-ctx-generalerr-clearerrors.png`,
`61-ctx-errorring-merge.png`, `62-ctx-errfromcode-findfirst.png`,
`63-ctx-errconst-multiple.png`):

| Function | Inputs | Outputs |
|----------|--------|---------|
| Simple Error Handler | `error code (no error:0)` I32, `error source (" ")`, `type of dialog (OK msg:1)` U16, `error in (no error)` | `error?`, `code out`, `source out`, `error out`, `message` |
| General Error Handler | `[user-defined descriptions]`, `[user-defined codes]`, `[error code (0)]`, `[error source (" ")]`, `search ni.com link visible?(T)`, `type of dialog (OK msg:1)`, `error in (no error)`, `[exception action] (none:0)`, `[exception code]`, `[exception source]` | `error?`, `code out`, `source out`, `message`, `error out` |
| Clear Errors | `specific error code to clear…`, `error in (no error)` | `specific error cleared?`, `error out` |
| Merge Errors | `error in 0`, `error in 1`, … `error in n-1` (node expandable downwards; born with 2) | `error out` |
| Error Cluster From Error Code | `is warning? (False)`, `show call chain (False)`, `error code (0)`, `error message ("")`, `error in (no error)` | `error out` |
| Find First Error | `error codes`, `error in (no error)`, `source messages` | `error?`, `error out` |

Error Ring: ring with `?!` (Context Help: "select and pass NI or custom error
codes"). Error Cluster Constant: see §1. Merge Errors, at 1:1 scale, measures
32 × 18 px with 2 inputs (587‥619 × 424‥442, `71.png`).

### Verified behavior

**Merge Errors** (2 inputs, `error in 0` on top and `error in 1` below; captures
`80`‥`84`):

| input 0 (top) | input 1 | `error out` |
|---------------|---------|-------------|
| warning (F,100,"w1") | error (T,200,"e2") | **the error** (T,200,"e2") — the error wins even if it is below (`80-merge-aviso-arriba-error-abajo.png`) |
| error (T,100,"w1") | error (T,200,"e2") | **the first from the top** (T,100,"w1") (`81-merge-dos-errores.png`) |
| warning (F,100,"w1") | warning (F,200,"e2") | **the first warning** (F,100,"w1") (`82-merge-dos-avisos.png`) |
| (F,0,"w1") no error | warning (F,200,"e2") | **the warning** (F,200,"e2"): a code 0 with status FALSE does not count even if it carries a source (`83-merge-sin-error-arriba.png`) |
| (F,0,"w1") | (F,0,"e2") | (F,0,"w1") — the first input as is, with its source (`84-merge-sin-error-ninguno.png`) |

Rule: errors before warnings; within each class, from top to bottom. With 3 or
more inputs the rule could not be checked (the wiring of 3 inputs came out
broken, `75-lista-de-errores-vi-roto.png`): **unverified** with n ≥ 3, although
the "top to bottom" order is what is to be expected.

**Clear Errors** (`87-clear-errors-resultado.png`): with error in (T,5000,
"prueba") → `error out` = **(F, 0, "")**: status to FALSE, code 0, empty source.
The help says the same (`85-clear-errors-ayuda.png`: "Resets the error status to
no error, code to 0, and source to an empty string… By default, this VI ignores
all errors. Wire an error code value to *specific error code to clear* if you
only want to ignore a specific error"). **Unverified**: the use of *specific
error code to clear* and the behavior with a warning at the input.

**Simple Error Handler** (with 5 indicators wired, `96`‥`104`):

- With error in (T,5000,"prueba") a **modal dialog** *with no title* appears with the
  text "**Error 5000 occurred at prueba**" (the source goes as is, without "in
  VI") followed by the paragraph for an undefined code (§6) and two buttons, **OK**
  (default) and **Why not found?** — with no error icon
  (`102-simple-error-handler-dialogo-5000.png`, enlarged
  `102b-dialogo-x2.png`). It is a different dialog from the automatic handling one (§4):
  there there is a ✘ icon, "Possible reason(s):" and *Continue/Stop*.
- Outputs with that error (`103-simple-error-handler-salidas-5000.png`):
  `error?` = **TRUE**, `code out` = **5000**, `source out` = **"prueba"**,
  `error out` = (T, 5000, "prueba") (the same cluster), `message` = text that
  starts with "Error 5000 …" (the indicator was narrow and only showed that
  line; it matches the dialog).
- With no error (F,0,"") **no dialog appears**; `error?` = FALSE, `code out` = 0,
  `source out` = "", `error out` = (F,0,""), `message` = "**No Error**"
  (`104-simple-error-handler-sin-error.png`).
- With a **defined** code (85, from `Scan From String` in Instrument Protocol, or a constant
  (T,85,"prueba")) the dialog is different (2026-10-15, `labview-captures/errores/seh-85/`): no title,
  the red ✘ icon, "**Error 85 occurred at …**" in bold with the whole source (the call chain wraps
  onto a second line), "**Possible reason(s):**" in bold, the reason, no separators, the link
  "Search ni.com for error" at the bottom left and a single button, **Continue** (default). Continue,
  the window's X, Enter and Esc all close it and the VI goes on; `error out` keeps the error.
- **Unverified**: the other values of `type of dialog` (default 1 =
  "OK msg"), General Error Handler (only its terminals were checked) and
  Find First Error.

**Error Cluster From Error Code.vi**: only its terminals and the
help were checked (`62-ctx-errfromcode-findfirst.png`: "Converts an error or warning code to
an error cluster… Passing *error code* 0 means that no error occurred and the VI
does not modify the error cluster"). What `source` it sets: **unverified**.

## 6. Codes and texts (Explain Error)

Window **Help ▸ Explain Error…** (`106-explain-error-vacio.png`): title
"Explain Error"; on the left an editable "Error Cluster" cluster with `Status`
(starts TRUE, ✘), `Code` (numeric with ▲▼), `Hex Code` (prefix `0x`, updates
by itself), `Source`; below the link "Search ni.com for additional
information about this error"; on the right the "Explanation" box.

Texts obtained (captures `107-explain-*.png`, `108-explain-aviso-7.png`,
`109-explain-source.png`). The first line is
"Error N occurred at <source>" and, without a source, **"…at an unidentified location"**;
with status FALSE it says **"Warning N occurred …"**. Then "**Possible
reason(s):**" and the text:

| code | text after "Possible reason(s):" |
|------|----------------------------------|
| 1 | "LabVIEW: (Hex 0x1) An input parameter is invalid. For example if the input is a path, the path might contain a character not allowed by the OS such as ? or @." |
| 2 | **two** reasons separated by a line of `=` signs (26): "LabVIEW: (Hex 0x2) Memory is full." / "LabVIEW: (Hex 0x2) ERROR_FILE_NOT_FOUND." |
| 7 | "LabVIEW: (Hex 0x7) File not found. The file might be in a different location or deleted. Use the command prompt or the file explorer to verify that the path is correct." |
| 56 | "LabVIEW: (Hex 0x38) The network operation exceeded the user-specified or system time limit." |
| 5000 (undefined) | without "Possible reason(s)": "This error code is undefined. Undefined errors might occur for a number of reasons. For example, no one has provided a description for the code, or you might have wired a number that is not an error code to the error code input. Additionally, undefined error codes might occur because the error relates to a third-party object, such as the operating system or ActiveX. For these third-party errors, you might be able to obtain a description of the error by searching the Web for the error code (5000) or for its hexadecimal representation (0x00001388)." |

Hex format: `0x` + the code in uppercase without leading zeros in the
window (`0x1388` for 5000); in the undefined-code text, 8 digits
(`0x00001388`).

**Origin of the texts**: they are **LabVIEW files**, not VI code.
They were listed (over SSH, read-only) in
`C:\Program Files\National Instruments\LabVIEW 2026\resource\errors\English\`:
`LabVIEW-errors.txt` (2529 entries, 360 kB), `Analysis-errors.txt` (345),
`OS and Network Services-errors.txt` (92), `LabVIEW WSN-errors.txt` (52),
`NI-Reports-errors.txt` (34), `Measure-errors.txt` (5). They are XML:
`<nierror code="7">LabVIEW: (Hex 0x7) File not found. …</nierror>`; a code with
several entries (number 2) appears repeated and Explain Error joins them with `=====`.
The user's own codes go in `user.lib\errors` (an empty folder in this
installation). No online help was consulted for this.

## 7. The error in structures

Confirmation (not run): an `error` wired to **Unbundle By Name** shows
`status`, and the Boolean output is wired to the condition terminal (stop) of a
While Loop without breaking the VI (`244-while-status-a-stop.png`; stop terminal = red
✱ in a green box, the `i` in blue). The Boolean wire of that stretch is thin
dotted green. **Unverified**: the tunnel with the error's shift register, and the OR
with the Stop button.

## 8. Case and Select tunnels (additional assignment)

All in the diagram of a new VI, with a Boolean `Case Structure` (frames `True`
and `False`; selector unwired unless indicated) and `Select`
(Comparison). Context Help of Select: "Returns the value wired to the t input or
f input, depending on the value of s" (`204.png`); terminals `t`, `s`, `f`,
output `s? t:f`; icon approx. 26 × 26.

1. **Cluster in each frame** (Error Cluster Constant in `True` and in `False`,
   wired to the right border): the first wiring creates a *hollow* output
   tunnel (white, `225.png`) that is **filled** with the color of the cluster
   (olive) as soon as the other frame also connects it (`226.png`,
   `229-case-tunel-cluster-error.png`). **The tunnel is of cluster type**: an
   Unbundle By Name wired to the tunnel shows `status`, and the wire's Context Help
   says "Data type of wire: error constant (cluster of 3 elements)"
   (`230.png`). It was "run" only as to the type (the selector was unwired
   and the VI broken because of it); **unverified** the real execution with the selector
   wired.
2. **I32 in one frame and DBL in another**: the tunnel becomes **DBL** (orange)
   (`233-case-tunel-i32-dbl-marco-false.png`). In the I32 frame the wire is
   blue and **the red coercion dot appears inside the tunnel, on its inner
   terminal, where the I32 wire enters** (`234-case-tunel-i32-dbl-marco-true.png`,
   zoom `234b-tunel-coercion-zoom.png`). The output tunnel took the type of the DBL
   even though the I32 was wired first (the tunnel was born blue/hollow and turned
   orange when the DBL was wired).
3. **String in one frame and number in the other**: the wire of the string frame
   is **broken** (dashed black line with a red ✘ between a pink tip and an
   orange one, `238-case-tunel-cadena-vs-dbl.png`, `235-…roto.png`); the tunnel
   keeps the type of the other frame (DBL). In the *Error list* (`239-lista-*.png`,
   `240-lista-tipos-distintos.png`) the message is "**You have connected two
   terminals of different types.**" and the *Details*: "These cannot be wired
   together because their data types (numeric, string, array, cluster, etc.) do
   not match. Show the Context Help window to see what data type is required.
   The type of the source is string. The type of the sink is double [64-bit
   real (~15 digit precision)]." In addition, because of the unwired selector,
   "Case Structure: Unwired selector" appears (Details: "The Case structure must have a
   Boolean, numeric or enumerated input wired to its selector terminal (the
   '?')"), and "<function>: Contains unwired or bad terminal" (Details: "One or more
   required inputs to this function are not wired or are wired incorrectly. Show
   the Context Help window…"). A wire with no source gives "This wire connects one or
   more data sinks but has no source." (`237.png`).
4. **Select**:
   - **two error clusters** in `t` and `f`: it accepts both, the wires stay
     normal (yellow) and the output connects to an Error Out without breaking
     (`212-select-clusters.png`). Terminal Context Help: "f (cluster of 3
     elements) status / code / source".
   - **two strings**: works; the output wire is pink, towards a string
     indicator without breaking (`218-select-cadenas.png`).
   - **I32 in `t` and DBL in `f`**: accepts; the **output is DBL** (orange wire to the
     DBL indicator) and the **red coercion dot is on terminal `t`** (the
     I32 input) of the Select itself (`221-select-i32-dbl.png`, zoom
     `221b-select-i32-dbl-recorte.png`).
   - **Unverified**: the value at run time; Select with incompatible types
     (string/number); `s` unwired in those tests (it did not mark a broken VI in the
     clusters one, see `212-…`; it was not measured rigorously).

## Rules that Solder should clone

1. The error cluster is `{status: bool, code: I32, source: string}` in that
   order; yellow wire with black dashes, 3 px, olive border.
2. Error In: by default (FALSE, 0, ""), caption "error in (no error)"; Error Out:
   caption "error out". Status FALSE = green ✔, TRUE = red ✘; `code` I32;
   `source` multiline with scroll.
3. A function with `error in`/`error out` **does not execute** with status TRUE: the
   same cluster comes out and the other outputs at their empty/default value; with a warning
   (FALSE, code ≠ 0) it **does execute** and propagates the warning.
4. The `source` of a function error = `"<function> in <VI>"` + `<APPEND>` + detail.
5. Automatic error handling: if a node's `error out` is not wired and there is a
   TRUE error, a modal dialog ("Error N occurred at <function> in <VI>", "Possible
   reason(s):", text from the table, link "Search ni.com for error", buttons
   **Continue** / **Stop**). Can be disabled per VI (VI Properties ▸ Execution ▸
   "Enable automatic error handling", on by default) and by options
   (Tools ▸ Options ▸ Block Diagram ▸ Error Handling).
6. Merge Errors: errors before warnings; within each class, the first from top to
   bottom; with none, the first input as is. A `code` 0 with status FALSE
   does not count as a warning.
7. Clear Errors: output (FALSE, 0, ""). Simple Error Handler: no error →
   `error?` F, code 0, source "", message "No Error", no dialog; with error →
   dialog "Error N occurred at <source>" + explanation, buttons OK / "Why
   not found?" (undefined code), `error?` T and the cluster passes through.
8. Explain Error: header "Error|Warning N occurred at <source|an unidentified
   location>"; "Possible reason(s):" + `LabVIEW: (Hex 0x…) text`; several
   reasons are separated with `=====`; undefined code → the paragraph "This error
   code is undefined…". The table of texts is XML files per family
   (`<nierror code="N">`), not code.
9. Case output tunnel: type of the only compatible type; I32+DBL → DBL tunnel
   with **coercion dot on the inner terminal of the I32 frame**; string
   vs number → broken wire with "You have connected two terminals of different
   types."; equal clusters → cluster tunnel. Select(t,f): output of the
   "bigger" type (DBL), coercion dot on the I32 terminal.
10. Dialog & User Interface subpalette: 4 columns, the order of the list in §5.
