//fairinoAdapter.js
import { findInteriorPoint } from "../utils/geometry";
import { sortBoxesForLua } from "../utils/sorting";
import { generateLuaAllFloors } from "./luaService";

export function buildFairinoMotionPlan({ boxes }) {
  return (boxes ?? []).map((b) => {
    const itemX = Math.round(b.x);
    const itemY = Math.round(b.y);
    const rz = Number(b.rotationDeg ?? 0);
    const zBase = Number(b.zBase ?? -900);

    let resultadoX = 0;
    let resultadoY = 0;
    let ptpRef = "";

    const itemZ = 300;
    const itemSafeZ = 20;
    const refY = 200;

    const ptpTransicionZ = zBase + itemZ + 200 + refY;
    const ptpWaitZ = zBase + itemZ + refY;
    const ptpLeftZ = zBase + itemZ;
    const ptpLeftSafeZ = zBase + itemZ + itemSafeZ;

    if (itemY < 0) {
      resultadoY = itemY + 424;
      resultadoX = itemX - (-623);
      ptpRef = "PL";
    } else {
      resultadoX = itemX - (-623);
      resultadoY = itemY - 424;
      ptpRef = "PR";
    }

    return {
      label: b.label,
      floor: b.floor,
      ref: ptpRef,
      x: itemX,
      y: itemY,
      w: b.w,
      h: b.h,
      rotationDeg: rz,
      zBase,
      resultadoX,
      resultadoY,
      ptpTransicionZ,
      ptpWaitZ,
      ptpLeftZ,
      ptpLeftSafeZ,
    };
  });
}


function pointInPolygon(pt, poly) {
  const x = pt.x;
  const y = pt.y;
  let inside = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

export function classifyBoxZone(box, referenceAreas) {
  const pt = { x: Number(box.x), y: Number(box.y) };

  const robot = (referenceAreas ?? []).find((a) => a.label === "Robot");
  const rLeft = (referenceAreas ?? []).find((a) => a.label === "RLeft");
  const rRight = (referenceAreas ?? []).find((a) => a.label === "RRight");

  if (rLeft?.points?.length >= 3 && pointInPolygon(pt, rLeft.points)) {
    return "RLeft";
  }

  if (rRight?.points?.length >= 3 && pointInPolygon(pt, rRight.points)) {
    return "RRight";
  }

  if (robot?.points?.length >= 3 && pointInPolygon(pt, robot.points)) {
    return "Robot";
  }

  return "OUTSIDE";
}

export function validateFairinoBoxes({ boxes, referenceAreas }) {
  return (boxes ?? []).map((box) => {
    const zone = classifyBoxZone(box, referenceAreas);

    return {
      ...box,
      zone,
      isValid: zone !== "OUTSIDE",
    };
  });
}

export function buildFairinoProject({ paintAreas, floorDefs }) {
  const referenceAreas = (paintAreas ?? [])
    .filter((a) => a.source !== "single")
    .map((a) => ({
      id: a.id,
      label: a.label,
      source: a.source ?? "paint",
      points: (a.points ?? []).map((p) => ({
        x: Number(p.x),
        y: Number(p.y),
      })),
    }));

  const floors = (floorDefs ?? [])
    .map((f) => ({
      floor: Number(f.floor),
      zBase: Number(f.zBase),
      color: f.color,
    }))
    .sort((a, b) => a.floor - b.floor);

  const boxes = sortBoxesForLua(
    (paintAreas ?? [])
      .filter((a) => a.source === "single")
      .map((a) => {
        const poly = a.points ?? [];
        const center = findInteriorPoint(poly);

        const xs = poly.map((p) => Number(p.x));
        const ys = poly.map((p) => Number(p.y));

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const floorNumber = Number(a.floor ?? 1);
        const floorDef = (floorDefs ?? []).find(
          (f) => Number(f.floor) === floorNumber
        );

        return {
          id: a.id,
          label: a.label,
          floor: floorNumber,
          x: Math.round(center.x),
          y: Math.round(center.y),
          w: Math.round(maxX - minX),
          h: Math.round(maxY - minY),
          rotationDeg: Number(a.rotationDeg ?? 0),
          zBase: Number(floorDef?.zBase ?? -900),
        };
      })
  );

  const validatedBoxes = validateFairinoBoxes({
    boxes,
    referenceAreas,
    });

    const motionPlan = buildFairinoMotionPlan({
    boxes: validatedBoxes,
    });

  const luaText = generateLuaAllFloors({
    paintAreas,
    floorDefs,
  });

  return {
    meta: {
      format: "fairino-project",
      version: 2,
      exportedAt: new Date().toISOString(),
    },
    referenceAreas,
    floors,
    boxes: validatedBoxes,
    motionPlan,
    luaText,
  };
}


export function buildFairinoLuaFile({ paintAreas, floorDefs }) {
  const luaText = generateLuaAllFloors({
    paintAreas,
    floorDefs,
  });

  return {
    filename: "fairino_program.lua",
    content: luaText,
  };
}