// The VI Server Reference constant (DT-090): a static reference to the OVI it sits in or to the application, as
// LabVIEW's constant of Functions ▸ Programming ▸ Application Control (measured on 2026-11-14,
// labview-captures/reports/2026-11-14-vi-server-reference.md). Only This OVI and This Application are built; Link to ▸
// Pane is not. A pure module, shared by the model, the compiler and the editor.

export const VI_SERVER_REFERENCE = "vi-server-reference";

/** The two classes it can be: the OVI class (LabVIEW's VI class, DT-071) and the Application class. */
export const OVI_CLASS = "OVI";
export const APPLICATION_CLASS = "Application";

/** The refnum types, `{ refnum: <class> }` as DT-072 §2's. */
export const THIS_OVI_TYPE = Object.freeze({ refnum: OVI_CLASS });
export const THIS_APPLICATION_TYPE = Object.freeze({ refnum: APPLICATION_CLASS });

/**
 * What the constant shows and what each class's wire is called, measured: the text "This VI" / "This Application"
 * (Solder says OVI for VI, DT-071) and the Context Help over the wire, "This Application (LabVIEW Application
 * Reference)", "This VI (Generic VI Reference)".
 */
const LINKS = Object.freeze({
  [OVI_CLASS]: { text: "This OVI", typeName: "Generic OVI Reference" },
  [APPLICATION_CLASS]: { text: "This Application", typeName: "LabVIEW Application Reference" },
});

export const isViServerReferenceClass = (className) => Object.hasOwn(LINKS, className);

/** The text the constant shows for its class; also its label's, which matches it (measured). */
export const linkText = (className) => LINKS[className]?.text ?? className;

/** The name of a refnum of `className` in a broken wire's explanation, or undefined for a class that is not one of these. */
export const viServerTypeName = (className) => LINKS[className]?.typeName;

/**
 * The refnum each constant holds. LabVIEW's are numbers of its session (0xEFE00000 for This Application, 0xFBF00026 for
 * This VI, measured), never 0 (Not A Refnum). Solder's are its own, fixed, and far from the small numbers control
 * references use (DT-072, amendment of 2026-11-03 §2); nothing reads them yet but a library that ignores them (DT-087 §5).
 */
const REFNUMS = Object.freeze({ [OVI_CLASS]: 0x50564901, [APPLICATION_CLASS]: 0x50415001 });

export const refnumOfClass = (className) => REFNUMS[className];
