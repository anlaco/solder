// Free labels (DT-085): text comments placed on empty space of the panel or the diagram, as in LabVIEW. Each one is
// a node of the graph, so it is selected, moved, deleted, copied and undone as any other object, but it has no
// ports and the compiler never sees it: the .sdg keeps it in `layout.free-labels`. A label of the panel has a
// `panel` place and no diagram place; one of the diagram has `x`, `y` and may sit inside a structure (`dentro`).

export const FREE_LABEL = "free-label";

export const isFreeLabel = (node) => node?.tipo === FREE_LABEL;

/** A free label that belongs to the panel, which the diagram does not show. */
export const isPanelFreeLabel = (node) => isFreeLabel(node) && !!node.panel;

/** A free label that belongs to the diagram, which the panel does not show. */
export const isDiagramFreeLabel = (node) => isFreeLabel(node) && !node.panel;
