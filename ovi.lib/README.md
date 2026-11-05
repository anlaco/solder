# ovi.lib

Solder's own library of OVIs ([DT-073](../docs/design/05-decisions.md#dt-073)), shipped with the application as
LabVIEW ships vi.lib. A caller names an OVI here by a symbolic path, `<ovilib>/Instr/…`, resolved against the
`ovi.lib` of the Solder that opens it. Folders follow vi.lib's (`Instr/`, `Utility/`).

Every OVI here is drawn anew from what was measured in LabVIEW: never NI's diagrams, icons or help texts. An OVI
added here reaches a palette only through its entry in `docs/schema/inventario-labview.json`, as a vi.lib VI
reaches one only through its `.mnu` file.
