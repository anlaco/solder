// What the main process tells the pages when a type definition changes (DT-104 stage b), and the pages understand: an OVI
// that follows an `.octl` rechecks it either applying the update (File ▸ Apply Changes of the control editor, or the OVI
// opening) or only checking it (the definition was saved and not applied: its instances that differ are broken until it
// is applied, measured: reports/2026-11-23-typedef-instances.md Q6).

export const FOLLOW = Object.freeze({ apply: "apply", check: "check" });
