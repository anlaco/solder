// The menu of the Application Instance box at the bottom left of an OVI window in a project, as measured in LabVIEW
// 2026 Q3 (labview-captures/reports/2026-11-24-typedef-mark-and-footer.md Q4): a right click opens two rows, "Main
// Application Instance" and the instance the OVI is open in, greyed; a left click does nothing. Pure, as the other
// menu files.

export const APPLICATION_INSTANCE_MENU_ROOT = "context.application-instance";

const CURRENT_ROW = `${APPLICATION_INSTANCE_MENU_ROOT}.current`;

/** The state with the box's menu open at (x, y); `instance` is the box's text ("P.sdproj/My Computer"). */
export const openApplicationInstanceMenu = (state, x, y, instance) => ({
  ...state,
  menu: { raiz: APPLICATION_INSTANCE_MENU_ROOT, nodo: null, puerto: null, x, y, en: null, abierto: null, applicationInstance: instance },
  accion: null,
  edicion: null,
});

/** The open menu's variants: the second row names the OVI's own instance, greyed, as the box does. */
export const applicationInstanceVariants = (d) =>
  d.menu?.raiz === APPLICATION_INSTANCE_MENU_ROOT ? { rotulos: new Map([[CURRENT_ROW, d.menu.applicationInstance]]), desactivados: new Set([CURRENT_ROW]) } : {};
