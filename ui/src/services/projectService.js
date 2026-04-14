import { clamp } from "../utils/workspace";
import { truncateLabel5, getNextBlueLabel } from "../utils/labels";
import {
  normalizeRotationDeg,
  rectAreaFromCenter,
  rotatePolygon,
} from "../utils/geometry";

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export function exportProjectData({ paintAreas, floorDefs, areaSummaryPointMm }) {
  const singleAreas = (paintAreas ?? [])
    .filter((a) => a.source === "single")
    .map((a) => {
      const center = areaSummaryPointMm(a);

      const xs = (a.points ?? []).map((p) => p.x);
      const ys = (a.points ?? []).map((p) => p.y);

      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      return {
        id: a.id,
        label: a.label,
        x: center.x,
        y: center.y,
        floor: a.floor ?? 1,
        rotationDeg: a.rotationDeg ?? 0,
        w: Math.round(maxX - minX),
        h: Math.round(maxY - minY),
      };
    });

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

  return {
    floors: floorDefs ?? [],
    areas: singleAreas,
    referenceAreas,
  };
}

export function importProjectData({
  rawText,
  limits,
  formatAreaCSVLine,
}) {
  const data = JSON.parse(String(rawText ?? ""));

  const importedFloors = Array.isArray(data?.floors)
    ? data.floors
    : Array.isArray(data?.grupo2?.pisos)
      ? data.grupo2.pisos
      : [];

  const importedAreas = Array.isArray(data?.areas)
    ? data.areas
    : Array.isArray(data?.grupo2?.cajas)
      ? data.grupo2.cajas
      : [];

  const importedReferenceAreas = Array.isArray(data?.referenceAreas)
    ? data.referenceAreas
    : [];

  const rebuiltSingleAreas = importedAreas.map((a, idx) => {
    const x = Number(a.x ?? 0);
    const y = Number(a.y ?? 0);
    const w = Math.max(1, Number(a.w ?? 300));
    const h = Math.max(1, Number(a.h ?? 400));
    const rotationDeg = normalizeRotationDeg(a.rotationDeg ?? 0);

    let pts = rectAreaFromCenter(x, y, w, h);

    if (rotationDeg !== 0) {
      pts = rotatePolygon(pts, rotationDeg);
    }

    pts = pts.map((p) => ({
      x: clamp(p.x, limits.minX, limits.maxX),
      y: clamp(p.y, limits.minY, limits.maxY),
    }));

    return {
      id:
        a.id ||
        globalThis.crypto?.randomUUID?.() ||
        `imported-single-${idx}-${Date.now()}`,
      label: truncateLabel5(a.label) || `B${idx + 1}`,
      points: pts,
      source: "single",
      floor: Number(a.floor ?? 1),
      rotationDeg,
    };
  });

  const rebuiltReferenceAreas = importedReferenceAreas.map((a, idx) => ({
    id:
      a.id ||
      globalThis.crypto?.randomUUID?.() ||
      `imported-ref-${idx}-${Date.now()}`,
    label: truncateLabel5(a.label) || `AREA${idx + 1}`,
    source: a.source ?? "paint",
    points: (a.points ?? []).map((p) => ({
      x: clamp(Number(p.x ?? 0), limits.minX, limits.maxX),
      y: clamp(Number(p.y ?? 0), limits.minY, limits.maxY),
    })),
  }));

  const rebuiltAreas = [...rebuiltReferenceAreas, ...rebuiltSingleAreas];

  const referenceText = rebuiltReferenceAreas
    .map((a) => formatAreaCSVLine(a.label, a.points))
    .join("\n");

  return {
    floorDefs: importedFloors,
    paintAreas: rebuiltAreas,
    nextLabel: getNextBlueLabel(rebuiltAreas),
    paintAreasText: referenceText,
  };
}