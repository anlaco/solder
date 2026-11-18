// What the main process decides about a Project Explorer window (DT-099 §6) that needs no Electron: its size, its
// numbering of untitled projects and its title. Measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-17-project-explorer-s1.md, Q1 and Q3).

/** The page of a new project's window, in pixels: 374 x 434 with its title bar (measured), less the 33 px bar the page does not hold. */
export const PROJECT_WINDOW_SIZE = Object.freeze({ width: 374, height: 434 - 33 });

/** The name of a project that was never saved: "Untitled Project 2" (measured). Each window takes the next number. */
export const untitledProjectName = (number) => `Untitled Project ${number}`;

/**
 * The window's title: the name, a star while there are changes, and what the window is. A new project is saved nowhere
 * and so has the star ("Untitled Project 2 * - Project Explorer"); once saved it is "P1.lvproj - Project Explorer".
 */
export const projectWindowTitle = ({ name, modified }) => `${name}${modified ? " *" : ""} - Project Explorer`;
