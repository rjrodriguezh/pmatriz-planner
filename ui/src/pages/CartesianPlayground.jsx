// CartesianPlayground.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function snapToStep(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

function truncateLabel5(label) {
  const s = (label ?? "").trim();
  if (!s) return "";
  return s.slice(0, 5);
}

function rectAreaFromCenter(cx, cy, w, h) {
  const halfW = w / 2;
  const halfH = h / 2;

  const left = cx - halfW;
  const right = cx + halfW;
  const bottom = cy - halfH;
  const top = cy + halfH;

  // orden: left-bottom, left-top, right-top, right-bottom
  return [
    { x: left, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
  ];
}

function formatAreaCSVLine(label, points) {
  const L = truncateLabel5(label) || "AREA";
  const tuples = points
    .map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`)
    .join(",");
  return `${L},${tuples}`;
}

/** Extrae números (x,y) desde una string. */
function parseXY(input) {
  const s = (input ?? "").trim();
  if (!s) return { ok: false, error: "Vacío." };

  const matches = s.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) {
    return { ok: false, error: "Formato inválido (x,y)." };
  }

  const x = Number(matches[0]);
  const y = Number(matches[1]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: "X o Y inválido." };
  }
  return { ok: true, x, y };
}

/**
 * Área por línea (CSV):
 *   Label,(x,y),(x,y),(x,y)...
 */
function parseAreaCSVLine(line) {
  const raw = (line ?? "").trim();
  if (!raw) return { ok: false, error: "Línea vacía." };

  const firstComma = raw.indexOf(",");
  if (firstComma === -1) {
    return { ok: false, error: "Falta coma después del label." };
  }

  const label = truncateLabel5(raw.slice(0, firstComma).trim()) || "AREA";
  const rest = raw.slice(firstComma + 1).trim();
  if (!rest) return { ok: false, error: "Faltan puntos." };

  const tupleRegex =
    /\(\s*[+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\s*\)/g;
  const tuples = rest.match(tupleRegex) || [];

  const points = [];
  for (const t of tuples) {
    const p = parseXY(t);
    if (p.ok) points.push({ x: p.x, y: p.y });
  }

  if (points.length < 3) {
    return { ok: false, error: "Área requiere mínimo 3 puntos (x,y)." };
  }

  return { ok: true, label, points };
}

/** Ray casting. poly = [{x,y},...] */
function pointInPolygon(pt, poly) {
  const x = pt.x;
  const y = pt.y;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Centroid (área ponderada). */
function polygonCentroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const x0 = poly[i].x;
    const y0 = poly[i].y;
    const x1 = poly[j].x;
    const y1 = poly[j].y;
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    const avg = poly.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    return { x: avg.x / poly.length, y: avg.y / poly.length };
  }
  cx /= 6 * a;
  cy /= 6 * a;
  return { x: cx, y: cy };
}

function findInteriorPoint(poly) {
  if (!poly || poly.length < 3) return { x: 0, y: 0 };

  // 1) centroide si cae dentro
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;

  // 2) promedio si cae dentro
  const avg = poly.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  const avgPt = { x: avg.x / poly.length, y: avg.y / poly.length };
  if (pointInPolygon(avgPt, poly)) return avgPt;

  // 3) búsqueda local
  const step = 10;
  for (let r = 1; r <= 20; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const pt = { x: c.x + dx * step, y: c.y + dy * step };
        if (pointInPolygon(pt, poly)) return pt;
      }
    }
  }
  return poly[0];
}

// helper label box coords
function labelBoxForValue(value, fontSizePx, paddingX = 3, paddingY = 2) {
  const s = String(value);
  const charW = fontSizePx * 0.62;
  const w = Math.max(12, Math.ceil(s.length * charW + paddingX * 2));
  const h = Math.max(8, Math.ceil(fontSizePx + paddingY * 2));
  return { w, h, padX: paddingX, padY: paddingY };
}

export default function CartesianPlayground() {
  const svgRef = useRef(null);

  // ✅ Drag (polígonos)
  const areaDragRef = useRef({
    active: false,
    id: "",
    startClientX: 0,
    startClientY: 0,
    startPoints: [],
  });

  // ✅ seleccionado
  const [selectedAreaId, setSelectedAreaId] = useState("");

  // ✅ Context menu / editor (click derecho + link "Editar")
  const [areaMenu, setAreaMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    areaId: "",
    draftLabel: "",
    draftXY: "",
    error: "",
  });

  // Workspace
  const [workspaceXmm, setWorkspaceXmm] = useState(5000);
  const [workspaceYmm, setWorkspaceYmm] = useState(5200);
  const [workspaceOriginXmm, setWorkspaceOriginXmm] = useState(-123);
  const [workspaceOriginYmm, setWorkspaceOriginYmm] = useState(0);

  // Grid
  const [gridMm, setGridMm] = useState(10);
  const [majorGridMm, setMajorGridMm] = useState(50);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Coordenadas visibles
  const [showCoords, setShowCoords] = useState(true);
  const [coordStepMm, setCoordStepMm] = useState(200);
  const [coordFontPx, setCoordFontPx] = useState(13);

  // Preview
  //const previewWrapRef = useRef(null);
  //const [previewPx, setPreviewPx] = useState({ w: 1050, h: 920 });
  // VIEWPORT fijo (lo que se ve en pantalla)
    const VIEWPORT_PX = 1600;

    // “SUPERFICIE” grande para poder scrollear
    const [surfacePx] = useState({ w: 4200, h: 4200 });

    // Scroll container
    const scrollRef = useRef(null);
    const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 });


    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;

      // centra el viewport dentro de la superficie
      const left = Math.max(0, (surfacePx.w - VIEWPORT_PX) / 2);
      const top = Math.max(0, (surfacePx.h - VIEWPORT_PX) / 2);
      el.scrollLeft = left;
      el.scrollTop = top;
      setScrollPos({ left, top });
    }, [surfacePx.w, surfacePx.h]);


  // Zoom + Pan
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Form agregar área azul
  const [newLabel, setNewLabel] = useState("B1");
  const [newXY, setNewXY] = useState("(417, -635)");
  const [newW, setNewW] = useState(150);
  const [newH, setNewH] = useState(300);
  const [addOneError, setAddOneError] = useState("");

  // Paint areas textarea
  const [paintEnabled, setPaintEnabled] = useState(true);
  const [paintAreasText, setPaintAreasText] = useState(
    "Robot,(-623,-425),(-623,425),(377,425),(377,-425)\nRRight,(-623,425),(-623,1625),(577,1625),(577,425)\nRLeft,(-623,-425),(-623,-1625),(577,-1625),(577,-425)"
  );
  const [paintAreas, setPaintAreas] = useState(() => []);
  const [paintAreasError, setPaintAreasError] = useState("");

  // Scale
  const baseScale = useMemo(() => {
    const pad = 16;
    const usableW = Math.max(1, VIEWPORT_PX - pad * 2);
    const usableH = Math.max(1, VIEWPORT_PX - pad * 2);
    const sx = usableW / workspaceXmm;
    const sy = usableH / workspaceYmm;
    return Math.min(sx, sy);
  }, [workspaceXmm, workspaceYmm]);


  const scale = useMemo(() => baseScale * zoom, [baseScale, zoom]);

  const pxDeltaToMmDelta = (dxPx, dyPx) => ({
    dx_mm: dxPx / scale,
    dy_mm: -dyPx / scale,
  });

  const stopDrag = () => {
    areaDragRef.current.active = false;
    areaDragRef.current.id = "";
    areaDragRef.current.startPoints = [];
  };

  // Center + pan
  const canvasCenterPx = useMemo(() => {
    return {
      x: scrollPos.left + VIEWPORT_PX / 2 + pan.x,
      y: scrollPos.top + VIEWPORT_PX / 2 + pan.y,
    };
  }, [scrollPos.left, scrollPos.top, pan.x, pan.y]);


  // ✅ px -> mm (DEBE estar dentro del componente)
  const pxToMm = (x_px, y_px) => {
    const x_rel = (x_px - canvasCenterPx.x) / scale;
    const y_rel = (canvasCenterPx.y - y_px) / scale;
    return {
      x_mm: x_rel + workspaceOriginXmm,
      y_mm: y_rel + workspaceOriginYmm,
    };
  };

  // limits
  const limits = useMemo(() => {
    const halfW = workspaceXmm / 2;
    const halfH = workspaceYmm / 2;
    return {
      minX: workspaceOriginXmm - halfW,
      maxX: workspaceOriginXmm + halfW,
      minY: workspaceOriginYmm - halfH,
      maxY: workspaceOriginYmm + halfH,
    };
  }, [workspaceXmm, workspaceYmm, workspaceOriginXmm, workspaceOriginYmm]);

  // mm -> px
  const mmToPx = (x_mm, y_mm) => {
    const x_rel = x_mm - workspaceOriginXmm;
    const y_rel = y_mm - workspaceOriginYmm;

    const x_px = canvasCenterPx.x + x_rel * scale;
    const y_px = canvasCenterPx.y - y_rel * scale;
    return { x_px, y_px };
  };

  const workspaceBorderPx = useMemo(() => {
    const lt = mmToPx(limits.minX, limits.maxY);
    const rb = mmToPx(limits.maxX, limits.minY);
    return {
      left: lt.x_px,
      top: lt.y_px,
      w: rb.x_px - lt.x_px,
      h: rb.y_px - lt.y_px,
    };
  }, [
    limits.minX,
    limits.maxX,
    limits.minY,
    limits.maxY,
    scale,
    canvasCenterPx.x,
    canvasCenterPx.y,
    workspaceOriginXmm,
    workspaceOriginYmm,
  ]);

  const gridLines = useMemo(() => {
    const lines = [];

    const startX = Math.ceil(limits.minX / gridMm) * gridMm;
    for (let x = startX; x <= limits.maxX; x += gridMm) {
      const isMajor = majorGridMm > 0 && Math.abs(x % majorGridMm) < 1e-9;
      const a = mmToPx(x, limits.minY);
      const b = mmToPx(x, limits.maxY);
      lines.push({
        key: `v_${x}`,
        x1: a.x_px,
        y1: a.y_px,
        x2: b.x_px,
        y2: b.y_px,
        major: isMajor,
      });
    }

    const startY = Math.ceil(limits.minY / gridMm) * gridMm;
    for (let y = startY; y <= limits.maxY; y += gridMm) {
      const isMajor = majorGridMm > 0 && Math.abs(y % majorGridMm) < 1e-9;
      const a = mmToPx(limits.minX, y);
      const b = mmToPx(limits.maxX, y);
      lines.push({
        key: `h_${y}`,
        x1: a.x_px,
        y1: a.y_px,
        x2: b.x_px,
        y2: b.y_px,
        major: isMajor,
      });
    }

    return lines;
  }, [
    limits.minX,
    limits.maxX,
    limits.minY,
    limits.maxY,
    gridMm,
    majorGridMm,
    scale,
    canvasCenterPx.x,
    canvasCenterPx.y,
    workspaceOriginXmm,
    workspaceOriginYmm,
  ]);

  // ✅ Coordenadas que se recalculan con zoom/pan (visibles siempre en el viewport)
  const coordLabels = useMemo(() => {
    if (!showCoords) return { xs: [], ys: [], usedStepMm: coordStepMm };

    const step = Math.max(10, Math.round(coordStepMm / 10) * 10);

    // Rango visible en mm según el viewport actual del SVG
    const leftPx = scrollPos.left;
    const topPx = scrollPos.top;
    const rightPx = scrollPos.left + VIEWPORT_PX;
    const bottomPx = scrollPos.top + VIEWPORT_PX;

    const tl = pxToMm(leftPx, topPx);
    const br = pxToMm(rightPx, bottomPx);

    const visMinX = Math.min(tl.x_mm, br.x_mm);
    const visMaxX = Math.max(tl.x_mm, br.x_mm);
    const visMinY = Math.min(tl.y_mm, br.y_mm);
    const visMaxY = Math.max(tl.y_mm, br.y_mm);

    const xs = [];
    const ys = [];

    // Labels X: pegados abajo
    const startX = Math.ceil(visMinX / step) * step;
    for (let x = startX; x <= visMaxX; x += step) {
      const p = mmToPx(x, visMinY);
      xs.push({
        key: `xl_${x}`,
        x: p.x_px,
        y: scrollPos.top + VIEWPORT_PX - 12,
        value: x,
      });
    }

    // Labels Y: pegados a la izquierda
    const startY = Math.ceil(visMinY / step) * step;
    for (let y = startY; y <= visMaxY; y += step) {
      const p = mmToPx(visMinX, y);
      ys.push({
        key: `yl_${y}`,
        x: 12,
        y: p.y_px,
        value: y,
      });
    }

    return { xs, ys, usedStepMm: step };
  }, [showCoords, coordStepMm, previewPx.w, previewPx.h, pxToMm, mmToPx]);

  const axes = useMemo(() => {
    const xA = mmToPx(limits.minX, workspaceOriginYmm);
    const xB = mmToPx(limits.maxX, workspaceOriginYmm);
    const yA = mmToPx(workspaceOriginXmm, limits.minY);
    const yB = mmToPx(workspaceOriginXmm, limits.maxY);
    return {
      x1: xA.x_px,
      y1: xA.y_px,
      x2: xB.x_px,
      y2: xB.y_px,
      yx1: yA.x_px,
      yy1: yA.y_px,
      yx2: yB.x_px,
      yy2: yB.y_px,
    };
  }, [
    limits.minX,
    limits.maxX,
    limits.minY,
    limits.maxY,
    scale,
    canvasCenterPx.x,
    canvasCenterPx.y,
    workspaceOriginXmm,
    workspaceOriginYmm,
  ]);

  // ✅ calcula punto resumen (mm) del polígono (interior point)
  function areaSummaryPointMmRaw(area) {
    const poly = area?.points ?? [];
    const p = findInteriorPoint(poly);
    return { x: p.x, y: p.y };
  }

  function areaSummaryPointMm(area) {
    const p = areaSummaryPointMmRaw(area);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  // ✅ abrir editor (menu) con label + coords actuales
  function openAreaEditorAt(clientX, clientY, areaId) {
    const area = (paintAreas ?? []).find((a) => a.id === areaId);
    if (!area) return;

    const p = areaSummaryPointMmRaw(area);
    setSelectedAreaId(areaId);
    setAreaMenu({
      open: true,
      x: clientX,
      y: clientY,
      areaId,
      draftLabel: truncateLabel5(area.label) || "AREA",
      draftXY: `(${Math.round(p.x)}, ${Math.round(p.y)})`,
      error: "",
    });
  }


  const onScroll = (e) => {
    const el = e.currentTarget;
    setScrollPos({ left: el.scrollLeft, top: el.scrollTop });
  };


  // ✅ click derecho sobre polígono
  const onAreaContextMenu = (e, areaId) => {
    e.preventDefault();
    e.stopPropagation();
    openAreaEditorAt(e.clientX, e.clientY, areaId);
  };

  // ✅ cerrar menú (click en cualquier parte)
  useEffect(() => {
    const close = () => setAreaMenu((m) => ({ ...m, open: false, areaId: "" }));
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

  // ✅ eliminar polígono
  function deletePolygon(id) {
    setPaintAreas((prev) => prev.filter((a) => a.id !== id));
    setSelectedAreaId((cur) => (cur === id ? "" : cur));
    setAreaMenu((m) => (m.areaId === id ? { ...m, open: false, areaId: "" } : m));
  }

  // ✅ aplica: cambia label + mueve polígono para que el “punto resumen” quede en (x,y)
  function applyAreaEdit() {
    const area = (paintAreas ?? []).find((a) => a.id === areaMenu.areaId);
    if (!area) return;

    const parsed = parseXY(areaMenu.draftXY);
    if (!parsed.ok) {
      setAreaMenu((m) => ({ ...m, error: parsed.error }));
      return;
    }

    const newLab = truncateLabel5(areaMenu.draftLabel) || "AREA";
    const cur = areaSummaryPointMmRaw(area); // (float)
    let dx = parsed.x - cur.x;
    let dy = parsed.y - cur.y;

    if (snapEnabled) {
      dx = snapToStep(dx, gridMm);
      dy = snapToStep(dy, gridMm);
    }

    setPaintAreas((prev) =>
      prev.map((a) => {
        if (a.id !== area.id) return a;
        const moved = (a.points ?? []).map((p) => ({
          x: clamp(p.x + dx, limits.minX, limits.maxX),
          y: clamp(p.y + dy, limits.minY, limits.maxY),
        }));
        return { ...a, label: newLab, points: moved };
      })
    );

    setAreaMenu((m) => ({ ...m, error: "" }));
  }

  // ✅ Drag start
  const onAreaPointerDown = (e, areaId) => {
    if (e.button === 2) return;

    e.preventDefault();
    e.stopPropagation();

    setSelectedAreaId(areaId);

    const area = (paintAreas ?? []).find((a) => a.id === areaId);
    if (!area) return;

    areaDragRef.current.active = true;
    areaDragRef.current.id = areaId;
    areaDragRef.current.startClientX = e.clientX;
    areaDragRef.current.startClientY = e.clientY;
    areaDragRef.current.startPoints = area.points.map((p) => ({ ...p }));

    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  // ✅ Drag move
  const onSvgPointerMove = (e) => {
    if (!areaDragRef.current.active) return;

    const dxPx = e.clientX - areaDragRef.current.startClientX;
    const dyPx = e.clientY - areaDragRef.current.startClientY;
    const { dx_mm, dy_mm } = pxDeltaToMmDelta(dxPx, dyPx);

    let dx = dx_mm;
    let dy = dy_mm;

    if (snapEnabled) {
      dx = snapToStep(dx, gridMm);
      dy = snapToStep(dy, gridMm);
    }

    const areaId = areaDragRef.current.id;
    const startPoints = areaDragRef.current.startPoints;

    setPaintAreas((prev) =>
      prev.map((a) => {
        if (a.id !== areaId) return a;
        const moved = startPoints.map((p) => ({
          x: clamp(p.x + dx, limits.minX, limits.maxX),
          y: clamp(p.y + dy, limits.minY, limits.maxY),
        }));
        return { ...a, points: moved };
      })
    );
  };

  const onSvgPointerUp = () => stopDrag();
  const onSvgPointerLeave = () => stopDrag();
  const onSvgPointerCancel = () => stopDrag();

  // ✅ agregar área azul + agrega también línea CSV
  const addOnePoint = () => {
    setAddOneError("");

    const label = truncateLabel5(newLabel) || "AREA";
    const parsed = parseXY(newXY);
    if (!parsed.ok) {
      setAddOneError(`Coordenadas inválidas: ${parsed.error}`);
      return;
    }

    let x = parsed.x;
    let y = parsed.y;

    if (snapEnabled) {
      x = snapToStep(x, gridMm);
      y = snapToStep(y, gridMm);
    }

    x = clamp(x, limits.minX, limits.maxX);
    y = clamp(y, limits.minY, limits.maxY);

    const w = Number(newW);
    const h = Number(newH);
    const w_mm = Number.isFinite(w) && w > 0 ? w : null;
    const h_mm = Number.isFinite(h) && h > 0 ? h : null;

    if (!w_mm || !h_mm) {
      setAddOneError("Para crear un polígono debes indicar ancho y alto (>0).");
      return;
    }

    let pts = rectAreaFromCenter(x, y, w_mm, h_mm);
    pts = pts.map((p) => ({
      x: clamp(p.x, limits.minX, limits.maxX),
      y: clamp(p.y, limits.minY, limits.maxY),
    }));

    const newAreaId =
      globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());

    setPaintAreas((prev) => [
      ...prev,
      { id: newAreaId, label, points: pts, source: "single" },
    ]);
    setSelectedAreaId(newAreaId);

    const line = formatAreaCSVLine(label, pts);
    setPaintAreasText((prev) => {
      const base = (prev ?? "").trim();
      return base ? `${base}\n${line}` : line;
    });
  };

  function applyPaintAreas() {
    const lines = (paintAreasText ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const areas = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseAreaCSVLine(lines[i]);
      if (!parsed.ok) {
        errors.push(`Línea ${i + 1}: ${parsed.error}`);
        continue;
      }
      areas.push({
        id:
          globalThis.crypto?.randomUUID?.() ??
          String(Date.now() + Math.random()),
        label: parsed.label,
        points: parsed.points,
        source: "csv",
      });
    }

    if (areas.length === 0) {
      setPaintAreasError(
        errors.length ? errors.join(" | ") : "No hay áreas válidas."
      );
      setPaintAreas([]);
      return;
    }

    setPaintAreasError(errors.length ? errors.slice(0, 4).join(" | ") : "");
    setPaintAreas(areas);
  }

  useEffect(() => {
    applyPaintAreas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paintAreasSvg = useMemo(() => {
    if (!paintEnabled) return [];

    const PAD_MM = 20;

    return (paintAreas ?? []).map((area) => {
      const polyMm = (area.points ?? []).map((p) => ({ x: p.x, y: p.y }));

      // 1) puntos en px para el <polygon />
      const ptsPx = polyMm.map((p) => {
        const pp = mmToPx(p.x, p.y);
        return { x_px: pp.x_px, y_px: pp.y_px };
      });
      const pointsAttr = ptsPx.map((p) => `${p.x_px},${p.y_px}`).join(" ");

      // bounds en mm
      let minX = Infinity;
      let maxY = -Infinity;
      for (const p of polyMm) {
        if (p.x < minX) minX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const candidateMm = { x: minX + PAD_MM, y: maxY - PAD_MM };
      const labelMm = pointInPolygon(candidateMm, polyMm)
        ? candidateMm
        : findInteriorPoint(polyMm);

      const labelPx = mmToPx(labelMm.x, labelMm.y);

      // top-left para el label azul (pegado arriba izquierda del polígono)
      const topLeftMm = { x: minX + PAD_MM, y: maxY - PAD_MM };
      const labelTopLeftPx = mmToPx(topLeftMm.x, topLeftMm.y);

      // centro (punto interior) para coords
      const centerMm = findInteriorPoint(polyMm);
      const labelCenterPx = mmToPx(centerMm.x, centerMm.y);

      return {
        id: area.id,
        label: truncateLabel5(area.label) || "AREA",
        source: area.source ?? "csv",
        pointsAttr,
        labelPx,
        labelCenterPx,
        labelTopLeftPx,
        summary: {
          x_mm: Math.round(centerMm.x),
          y_mm: Math.round(centerMm.y),
        },
      };
    });
  }, [paintEnabled, paintAreas, mmToPx]);

  const coordBox = useMemo(() => {
    const fs = clamp(Number(coordFontPx) || 5, 4, 16);
    return { fs, ...labelBoxForValue("-9999", fs, 3, 2) };
  }, [coordFontPx]);

  // ✅ tamaños de texto del área azul (se adaptan al zoom)
  const blueLabelFs = clamp(18 / zoom, 12, 22);
  const blueCoordFs = clamp(16 / zoom, 11, 20);
  const blueLineDy = clamp(12 / zoom, 9, 14);

  return (
    <div
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "240px minmax(1100px, 1fr) 360px",
        gap: 16,
        width: "100%",
        boxSizing: "border-box",
        alignItems: "start",
      }}
    >
      {/* IZQUIERDA */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 10,
          overflow: "auto",
          maxHeight: "calc(100vh - 32px)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Cartesian Playground</h3>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Workspace (mm)</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#333" }}>
              workspace_x_mm
            </label>
            <input
              type="number"
              value={workspaceXmm}
              onChange={(e) =>
                setWorkspaceXmm(Math.max(1, Number(e.target.value || 1)))
              }
            />

            <label style={{ fontSize: 12, color: "#333" }}>
              workspace_y_mm
            </label>
            <input
              type="number"
              value={workspaceYmm}
              onChange={(e) =>
                setWorkspaceYmm(Math.max(1, Number(e.target.value || 1)))
              }
            />

            <label style={{ fontSize: 12, color: "#333" }}>
              workspace_origin_x_mm
            </label>
            <input
              type="number"
              value={workspaceOriginXmm}
              onChange={(e) => setWorkspaceOriginXmm(Number(e.target.value || 0))}
            />

            <label style={{ fontSize: 12, color: "#333" }}>
              workspace_origin_y_mm
            </label>
            <input
              type="number"
              value={workspaceOriginYmm}
              onChange={(e) => setWorkspaceOriginYmm(Number(e.target.value || 0))}
            />
          </div>

          <div
            style={{
              marginTop: 8,
              fontFamily: "monospace",
              fontSize: 12,
              color: "#555",
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
            }}
          >
            X range: [{limits.minX}, {limits.maxX}]{"\n"}
            Y range: [{limits.minY}, {limits.maxY}]{"\n"}
            (0,0) del mapa en mm reales: ({workspaceOriginXmm},{" "}
            {workspaceOriginYmm})
          </div>

          <button
            onClick={() => {
              setWorkspaceOriginXmm(-123);
              setWorkspaceOriginYmm(0);
            }}
            style={{
              marginTop: 10,
              padding: "8px 10px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Centrar Robot (0,0)
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Grid</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#333" }}>grid_mm</label>
            <input
              type="number"
              value={gridMm}
              onChange={(e) =>
                setGridMm(Math.max(1, Number(e.target.value || 1)))
              }
            />

            <label style={{ fontSize: 12, color: "#333" }}>
              major_grid_mm
            </label>
            <input
              type="number"
              value={majorGridMm}
              onChange={(e) =>
                setMajorGridMm(Math.max(1, Number(e.target.value || 1)))
              }
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
            />
            Snap to grid
          </label>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Coordenadas</div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={showCoords}
              onChange={(e) => setShowCoords(e.target.checked)}
            />
            Mostrar números
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 8,
              marginTop: 8,
            }}
          >
            <label style={{ fontSize: 12, color: "#333" }}>step_mm</label>
            <input
              type="number"
              value={coordStepMm}
              min={10}
              step={10}
              onChange={(e) => {
                const v = Math.max(10, Number(e.target.value || 10));
                setCoordStepMm(Math.round(v / 10) * 10);
              }}
            />

            <label style={{ fontSize: 12, color: "#333" }}>coord_font_px</label>
            <input
              type="number"
              min={4}
              max={16}
              step={1}
              value={coordFontPx}
              onChange={(e) =>
                setCoordFontPx(clamp(Number(e.target.value || 5), 4, 16))
              }
            />
          </div>

          <div
            style={{
              marginTop: 8,
              fontFamily: "monospace",
              fontSize: 12,
              color: "#555",
              whiteSpace: "pre-wrap",
            }}
          >
            step usado: {coordLabels.usedStepMm} mm{"\n"}
            font: {coordBox.fs}px
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>View</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#333" }}>zoom</label>
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </div>

          <div
            style={{
              marginTop: 8,
              fontFamily: "monospace",
              fontSize: 12,
              color: "#555",
            }}
          >
            scale(px/mm): {scale.toFixed(6)}
          </div>
        </div>
      </div>

      {/* CENTRO */}
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 12,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>

      {/* ✅ VIEWPORT fijo con SCROLL */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          width: VIEWPORT_PX,          // 👈 ejemplo: 1600
          height: VIEWPORT_PX,         // 👈 ejemplo: 1600
          border: "1px solid #cfcfcf",
          borderRadius: 8,
          background: "#fff",
          overflow: "auto",            // ✅ scroll
          position: "relative",
        }}
      >
        {/* ✅ SUPERFICIE grande para scrollear */}
        <div
          style={{
            width: surfacePx.w,
            height: surfacePx.h,
            position: "relative",
            background: "#fff",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: workspaceBorderPx.left,
              top: workspaceBorderPx.top,
              width: workspaceBorderPx.w,
              height: workspaceBorderPx.h,
              border: "2px dashed #999",
              boxSizing: "border-box",
              pointerEvents: "none",
            }}
          />

          <svg
            ref={svgRef}
            width={surfacePx.w}
            height={surfacePx.h}
            style={{ position: "absolute", left: 0, top: 0 }}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerLeave={onSvgPointerLeave}
            onPointerCancel={onSvgPointerCancel}
          >
            {gridLines.map((ln) => (
              <line
                key={ln.key}
                x1={ln.x1}
                y1={ln.y1}
                x2={ln.x2}
                y2={ln.y2}
                stroke={ln.major ? "#d2d2d2" : "#efefef"}
                strokeWidth={ln.major ? 1.2 : 1}
              />
            ))}

            <line
              x1={axes.x1}
              y1={axes.y1}
              x2={axes.x2}
              y2={axes.y2}
              stroke="#ff4d4d"
              strokeWidth={2}
            />
            <line
              x1={axes.yx1}
              y1={axes.yy1}
              x2={axes.yx2}
              y2={axes.yy2}
              stroke="#ff4d4d"
              strokeWidth={2}
            />

            {showCoords ? (
              <g>
                {coordLabels.xs.map((t) => {
                  const box = labelBoxForValue(t.value, coordBox.fs, 3, 2);
                  return (
                    <g key={t.key}>
                      <rect
                        x={t.x - box.w / 2}
                        y={t.y - box.h / 2}
                        width={box.w}
                        height={box.h}
                        rx={2}
                        ry={2}
                        fill="rgba(255,255,255,0.75)"
                      />
                      <text
                        x={t.x}
                        y={t.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={coordBox.fs}
                        fontFamily="monospace"
                        fill="#333"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {t.value}
                      </text>
                    </g>
                  );
                })}

                {coordLabels.ys.map((t) => {
                  const box = labelBoxForValue(t.value, coordBox.fs, 3, 2);
                  const textX = t.x + box.w / 2;
                  return (
                    <g key={t.key}>
                      <rect
                        x={textX - box.w / 2}
                        y={t.y - box.h / 2}
                        width={box.w}
                        height={box.h}
                        rx={2}
                        ry={2}
                        fill="rgba(255,255,255,0.75)"
                      />
                      <text
                        x={textX}
                        y={t.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={coordBox.fs}
                        fontFamily="monospace"
                        fill="#333"
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {t.value}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* ÁREAS */}
            {paintAreasSvg.map((a) => (
              <g key={a.id}>
                <polygon
                  points={a.pointsAttr}
                  fill={
                    a.source === "single"
                      ? "rgba(43,108,255,0.10)"
                      : "rgba(255,140,0,0.10)"
                  }
                  stroke={
                    a.id === selectedAreaId
                      ? a.source === "single"
                        ? "rgba(43,108,255,0.95)"
                        : "rgba(255,140,0,0.95)"
                      : a.source === "single"
                      ? "rgba(43,108,255,0.70)"
                      : "rgba(255,140,0,0.70)"
                  }
                  strokeWidth="2"
                  style={{
                    cursor: areaDragRef.current.active ? "grabbing" : "grab",
                  }}
                  onPointerDown={(e) => onAreaPointerDown(e, a.id)}
                  onContextMenu={(e) => onAreaContextMenu(e, a.id)}
                />

                {/* ✅ SOLO AZUL */}
                {a.source === "single" ? (
                  <g>
                    <text
                      x={a.labelTopLeftPx.x_px}
                      y={a.labelTopLeftPx.y_px}
                      textAnchor="start"
                      dominantBaseline="hanging"
                      fontSize={blueLabelFs}
                      fontFamily="monospace"
                      fontWeight={900}
                      fill="#111"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {a.label}
                    </text>

                    <text
                      x={a.labelCenterPx.x_px}
                      y={a.labelCenterPx.y_px}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={blueCoordFs}
                      fontFamily="monospace"
                      fontWeight={800}
                      fill="#111"
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      <tspan x={a.labelCenterPx.x_px} dy="0">
                        x={a.summary.x_mm}
                      </tspan>
                      <tspan x={a.labelCenterPx.x_px} dy={blueLineDy}>
                        y={a.summary.y_mm}
                      </tspan>
                    </text>
                  </g>
                ) : (
                  <text
                    x={a.labelPx.x_px}
                    y={a.labelPx.y_px}
                    textAnchor="start"
                    dominantBaseline="hanging"
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight={700}
                    fill="#111"
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {a.label}
                  </text>
                )}
              </g>
            ))}

            {/* punto origin */}
            {(() => {
              const o = mmToPx(workspaceOriginXmm, workspaceOriginYmm);
              return (
                <g>
                  <circle cx={o.x_px} cy={o.y_px} r={4} fill="#ff4d4d" />
                  <text
                    x={o.x_px + 8}
                    y={o.y_px}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight={800}
                    fill="#ff4d4d"
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    ORIGIN
                  </text>
                </g>
              );
            })()}
          </svg>
        </div>
      </div>
    </div>

    {/* DERECHA */}


      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 8,
          overflow: "auto",
          maxHeight: "calc(100vh - 32px)",
          fontSize: 13,
        }}
      >
        {/* Agregar área */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Agregar (crea área azul)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#333" }}>label (máx 5)</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="B1"
            />

            <label style={{ fontSize: 12, color: "#333" }}>
              coordenadas (x,y)
            </label>
            <input
              value={newXY}
              onChange={(e) => setNewXY(e.target.value)}
              placeholder="(43, 544)"
            />

            <label style={{ fontSize: 12, color: "#333" }}>ancho (mm)</label>
            <input
              type="number"
              value={newW}
              onChange={(e) => setNewW(Number(e.target.value || 0))}
            />

            <label style={{ fontSize: 12, color: "#333" }}>alto (mm)</label>
            <input
              type="number"
              value={newH}
              onChange={(e) => setNewH(Number(e.target.value || 0))}
            />
          </div>

          {addOneError ? (
            <div style={{ marginTop: 8, color: "#b00020", fontSize: 12 }}>
              {addOneError}
            </div>
          ) : null}

          <button
            onClick={addOnePoint}
            style={{
              marginTop: 10,
              padding: "8px 10px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Agregar (crea área azul)
          </button>
        </div>

        {/* ✅ Panel flotante: click derecho */}
        {areaMenu.open &&
          (() => {
            const area = (paintAreas ?? []).find((a) => a.id === areaMenu.areaId);
            if (!area) return null;

            const pos = areaSummaryPointMm(area);

            return (
              <div
                style={{
                  position: "fixed",
                  left: areaMenu.x + 10,
                  top: areaMenu.y + 10,
                  width: 280,
                  background: "#fff",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  padding: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                  zIndex: 9999,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  {truncateLabel5(area.label) || "AREA"} ({pos.x},{pos.y})
                </div>

                <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                  Cambia label y/o el punto (x,y) del “centro interior”.
                </div>

                <div style={{ fontSize: 12, marginBottom: 6 }}>Label (máx 5)</div>
                <input
                  value={areaMenu.draftLabel}
                  onChange={(e) =>
                    setAreaMenu((m) => ({ ...m, draftLabel: e.target.value }))
                  }
                  style={{ width: "100%", boxSizing: "border-box" }}
                />

                <div style={{ fontSize: 12, marginTop: 10, marginBottom: 6 }}>
                  Mover a (x,y)
                </div>
                <input
                  value={areaMenu.draftXY}
                  onChange={(e) =>
                    setAreaMenu((m) => ({ ...m, draftXY: e.target.value }))
                  }
                  style={{ width: "100%", boxSizing: "border-box" }}
                />

                {areaMenu.error ? (
                  <div style={{ marginTop: 8, color: "#b00020", fontSize: 12 }}>
                    {areaMenu.error}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() =>
                      setAreaMenu((m) => ({ ...m, open: false, areaId: "" }))
                    }
                    style={{ flex: 1, padding: "8px 10px", cursor: "pointer" }}
                  >
                    Cerrar
                  </button>

                  <button
                    onClick={() => applyAreaEdit()}
                    style={{ flex: 1, padding: "8px 10px", cursor: "pointer" }}
                  >
                    Aplicar
                  </button>

                  <button
                    onClick={() => deletePolygon(area.id)}
                    style={{
                      padding: "8px 10px",
                      cursor: "pointer",
                      color: "#b00020",
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })()}

        {/* Áreas a pintar (textarea) */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 900 }}>Área a pintar (múltiples)</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={paintEnabled}
                onChange={(e) => setPaintEnabled(e.target.checked)}
              />
              Mostrar
            </label>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Formato por línea: <b>Label,(x,y),(x,y),(x,y)...</b> (Label máx 5)
          </div>

          <textarea
            value={paintAreasText}
            onChange={(e) => setPaintAreasText(e.target.value)}
            rows={8}
            style={{
              width: "100%",
              marginTop: 8,
              fontFamily: "monospace",
              fontSize: 12,
              padding: 8,
              boxSizing: "border-box",
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
          />

          {paintAreasError ? (
            <div style={{ marginTop: 8, color: "#b00020", fontSize: 13 }}>
              {paintAreasError}
            </div>
          ) : null}

          <button
            onClick={applyPaintAreas}
            style={{ marginTop: 10, padding: "8px 10px", cursor: "pointer", width: "100%" }}
          >
            Aplicar áreas
          </button>

          <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, color: "#555" }}>
            áreas cargadas: {paintAreas?.length ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
