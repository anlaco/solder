// The items of an enum (DT-049): they are the type, the edit operation and what it
// does to the Cases fed by the enum. Measured in LabVIEW 2026 Q3:
// labview-captures/reports/2026-10-14-enum-edit-items.md and -enum-edit-items-2.md.

import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { compilar } from "../../core/compiler/compiler.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

/** A small VI builder over the core graph functions; see `construir` in structures.test.mjs. */
function construir(pasos) {
  const v = { g: Gr.nuevo(), id: {} };
  const api = {
    case(nombre) {
      const r = Gr.crearEstructura(v.g, CAT, "case-structure", 0, 0, 200, 150);
      v.g = r.g;
      v.id[nombre] = r.id;
      v.id[`${nombre}:sel`] = v.g.nodos.find((n) => n.dentro === r.id && n.tipo === "case-selector").id;
    },
    bucle(nombre) {
      const r = Gr.crearEstructura(v.g, CAT, "while-loop", 0, 0, 200, 150);
      v.g = r.g;
      v.id[nombre] = r.id;
    },
    registro(nombre, bucle) {
      const r = Gr.crearRegistro(v.g, CAT, v.id[bucle], 0);
      v.g = r.g;
      v.id[`${nombre}.izq`] = r.izquierdo;
      v.id[`${nombre}.der`] = r.derecho;
    },
    nodo(nombre, tipo, config, dentro) {
      const r = Gr.crearNodo(v.g, CAT, tipo, 0, 0);
      v.g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
      v.id[nombre] = r.id;
      if (dentro) v.g = Gr.meter(v.g, CAT, [r.id], v.id[dentro]);
    },
    marcos(caso, lista) {
      v.g = Gr.fijarMarcos(v.g, CAT, v.id[caso], lista);
    },
    cable(de, a) {
      const [n1, p1] = [de.slice(0, de.lastIndexOf(".")), de.slice(de.lastIndexOf(".") + 1)];
      const [n2, p2] = [a.slice(0, a.lastIndexOf(".")), a.slice(a.lastIndexOf(".") + 1)];
      const r = Gr.conectar(v.g, CAT, { nodo: v.id[n1], puerto: p1, dir: "out" }, { nodo: v.id[n2], puerto: p2, dir: "in" });
      assert.ok(!r.motivo, `${de} → ${a}: ${r.motivo}`);
      v.g = r.g;
    },
  };
  pasos(api);
  return v;
}

const ESTADOS = { enum: ["Init", "Heat", "Cool", "Done"] };
const marcosDe = (v, caso) => v.g.nodos.find((n) => n.id === v.id[caso]).config.marcos;

test("a fresh enum is born with one empty item, as in LabVIEW", () => {
  const { g, id } = construir((b) => b.nodo("e", "enum-const"));
  const n = g.nodos.find((k) => k.id === id.e);
  assert.deepEqual(n.config.type, { enum: [""] });
  assert.equal(n.config.value, 0);
});

test("editing the items changes the type; the value stays unless it falls out of range", () => {
  const v = construir((b) => b.nodo("e", "enum-const", { type: ESTADOS, value: 2 }));
  // Deleting an item does not clamp the value: 2 still names an item, now "Done" (measured, d).
  let g = Gr.editarItemsEnum(v.g, v.id.e, ["Init", "Heat", "Done"]);
  assert.deepEqual(g.nodos.find((n) => n.id === v.id.e).config, { type: { enum: ["Init", "Heat", "Done"] }, value: 2 });
  // Deleting the item the value names clamps it into range (measured, second report Q1).
  g = Gr.editarItemsEnum(g, v.id.e, ["Init"]);
  assert.equal(g.nodos.find((n) => n.id === v.id.e).config.value, 0);
});

test("a rename reaches the frames of the Case the enum feeds; a deletion leaves the stale name", () => {
  const v = construir((b) => {
    b.case("c");
    b.nodo("e", "enum-const", { type: ESTADOS });;
    b.marcos("c", [{ valores: ["Init"], default: true }, { valores: ["Heat"] }, { valores: [{ min: "Cool", max: "Done" }] }]);
    b.cable("e.result", "c:sel.selector");
  });
  let g = Gr.editarItemsEnum(v.g, v.id.e, ["Start", "Heat", "Cool", "Done"], { Init: "Start" });
  assert.deepEqual(
    marcosDe({ g, id: v.id }, "c").map((m) => m.valores),
    [["Start"], ["Heat"], [{ min: "Cool", max: "Done" }]],
    "the renamed item is renamed in its frames"
  );
  // Deleting "Heat" leaves the frame with the stale name, in red, and breaks the Case; the
  // wire stays whole (measured, question 7).
  const cables = g.cables.length;
  g = Gr.editarItemsEnum(g, v.id.e, ["Start", "Cool", "Done"]);
  assert.equal(g.cables.length, cables, "the wire is not broken");
  assert.deepEqual(marcosDe({ g, id: v.id }, "c")[1].valores, ["Heat"], "the deleted item keeps its stale name");
  const errores = compilar(g, CAT).errores;
  assert.ok(errores.some((e) => e.motivo === "Case Structure: Selector values have wrong type"), JSON.stringify(errores));
});

test("a rename does not reach a Case fed by another enum", () => {
  const v = construir((b) => {
    b.case("c1");
    b.case("c2");
    b.nodo("a", "enum-const", { type: ESTADOS });
    b.nodo("b", "enum-const", { type: ESTADOS });
    b.marcos("c1", [{ valores: ["Init"], default: true }]);
    b.marcos("c2", [{ valores: ["Init"], default: true }]);
    b.cable("a.result", "c1:sel.selector");
    b.cable("b.result", "c2:sel.selector");
  });
  const g = Gr.editarItemsEnum(v.g, v.id.a, ["Start", "Heat", "Cool", "Done"], { Init: "Start" });
  assert.deepEqual(marcosDe({ g, id: v.id }, "c1")[0].valores, ["Start"]);
  assert.deepEqual(marcosDe({ g, id: v.id }, "c2")[0].valores, ["Init"], "the other enum's frames are untouched");
});

test("a rename travels through a shift register, as the state machine does", () => {
  const v = construir((b) => {
    b.bucle("w");
    b.registro("sr", "w");
    b.nodo("e", "enum-const", { type: ESTADOS });;
    b.case("c"); // placed inside the loop below
    b.marcos("c", [{ valores: ["Init"], default: true }, { valores: ["Heat"] }]);
    b.cable("e.result", "sr.izq.init");
  });
  // The Case inside the loop, its selector fed by the register's inner value.
  let g = Gr.meter(v.g, CAT, [v.id.c], v.id.w);
  g = Gr.conectar(g, CAT, { nodo: v.id["sr.izq"], puerto: "value", dir: "out" }, { nodo: v.id["c:sel"], puerto: "selector", dir: "in" }).g;
  g = Gr.editarItemsEnum(g, v.id.e, ["Start", "Heat", "Cool", "Done"], { Init: "Start" });
  const marcos = g.nodos.find((n) => n.id === v.id.c).config.marcos;
  assert.deepEqual(marcos.map((m) => m.valores), [["Start"], ["Heat"]], "the rename reaches the Case through the register");
});

test("a .qvi with enum items and enum frames by name round-trips", () => {
  const v = construir((b) => {
    b.case("c");
    b.nodo("e", "enum-const", { type: ESTADOS });;
    b.marcos("c", [{ valores: ["Init"], default: true }, { valores: ["Heat"] }]);
    b.cable("e.result", "c:sel.selector");
  });
  const texto = aTexto(v.g, CAT);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validate(JSON.parse(texto)), JSON.stringify(validate.errors));
  assert.equal(aTexto(leer(texto, CAT), CAT), texto, "saving what was opened gives the same text");
});
