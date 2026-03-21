//CartesianPlayground.jsx
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

function rotatePointAroundCenter(px, py, cx, cy, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = px - cx;
  const dy = py - cy;

  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function rotatePolygon(points, angleDeg) {
  if (!points || points.length === 0) return points ?? [];

  const center = findInteriorPoint(points);

  return points.map((p) =>
    rotatePointAroundCenter(p.x, p.y, center.x, center.y, angleDeg)
  );
}

function normalizeRotationDeg(value) {
  const n = Number(value) || 0;
  const normalized = ((n % 360) + 360) % 360;
  return normalized;
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

function normalizeReferencePoints(rawPoints) {
  return (rawPoints ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.name === "string" &&
        Number.isFinite(Number(p.x)) &&
        Number.isFinite(Number(p.y))
    )
    .map((p) => ({
      name: String(p.name).trim(),
      x: Number(p.x),
      y: Number(p.y),
    }));
}

function normalizeLabel(label) {
  return String(label ?? "").trim().toUpperCase();
}

function getNextBlueLabel(areas) {
  const usedNums = (areas ?? [])
    .filter((a) => a.source === "single")
    .map((a) => {
      const m = normalizeLabel(a.label).match(/^B(\d+)$/);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => Number.isFinite(n));

  let next = 1;
  while (usedNums.includes(next)) next += 1;
  return `B${next}`;
}


function labelBoxForValue(value, fontSizePx, paddingX = 3, paddingY = 2) {
  const s = String(value);
  const charW = fontSizePx * 0.62;
  const w = Math.max(12, Math.ceil(s.length * charW + paddingX * 2));
  const h = Math.max(8, Math.ceil(fontSizePx + paddingY * 2));
  return { w, h, padX: paddingX, padY: paddingY };
}




function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function downloadJsonFile(filename, data) {
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

/* =========================
   LUA GENERATOR HELPERS
   ========================= */
function parseBoxNumber(label) {
  const m = String(label || "").match(/\d+/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

function sortBoxesForLua(list) {
  return [...(list || [])].sort((a, b) => {
    const na = parseBoxNumber(a.label);
    const nb = parseBoxNumber(b.label);
    if (na !== nb) return na - nb;
    return String(a.label).localeCompare(String(b.label));
  });
}

function generateLuaFloor1({ boxes }) {
  const lines = [];

  lines.push("-- ####### PISO 1 (AUTO) #######");
  lines.push(`-- total boxes: ${boxes.length}`);
  lines.push("");

  // Inicio
  lines.push("PTP(HZ,100,-1,0)");
  lines.push("");

  boxes.forEach((b, idx) => {
    const itemX = Math.round(b.x);
    const itemY = Math.round(b.y);

    const rotationDeg = normalizeRotationDeg(b.rotationDeg ?? 0);
    const rz = rotationDeg === 270 ? -90 : rotationDeg;

    const resultadoX = itemX - (-623);

    let resultadoY = 0;
    let refY = 200;
    let ptpRef = "";

    let itemZ = 300;
    let itemSafeZ = 20;
    let ptpWaitZ = 0;
    let ptpLeftZ = 0;
    let ptpLeftSafeZ = 0;


    const zBase = Number(b.zBase ?? -900);

    ptpWaitZ = zBase + itemZ + refY;
    ptpLeftZ = zBase + itemZ;
    ptpLeftSafeZ = zBase + itemZ + itemSafeZ;

    if (itemY < 0) {
      resultadoY = itemY - refY;
      ptpRef = "PL";
    } else {
      resultadoY = itemY - refY;
      ptpRef = "PR";
    }

    lines.push(`-- BOX ${idx + 1} (${b.label}) rot=${rotationDeg}°`);
    lines.push(`-- floor=${b.floor} zBase=${zBase}`);
    lines.push("SetAuxDO(4,0,0,0)");
    lines.push("PTP(PickWait,100,-1,0)");
    lines.push("PTP(PickSafe,100,-1,0)");
    lines.push("PTP(PickPoint,100,-1,0)");
    lines.push("SetAuxDO(4,1,0,0)");
    lines.push("PTP(PickSafe,100,-1,0)");
    lines.push(`--Comen: Destino Wait Z = ${ptpWaitZ}`);
    lines.push(`--Comen: Destino Dejar Z = ${ptpLeftZ}`);
    lines.push(`--Comen: Destino Safe Z = ${ptpLeftSafeZ}`);
    lines.push(`--Comen: Rotacion RZ = ${rz}`);

    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpWaitZ},0,0,${rz})`);
    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpLeftZ},0,0,${rz})`);
    lines.push("SetAuxDO(4,0,0,0)");
    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpLeftSafeZ},0,0,${rz})`);
    lines.push("");
  });

  return lines.join("\n");
}

export default function CartesianPlayground() {
  // refs
  const svgRef = useRef(null);

  // ✅ VIEWPORT responsivo (para que no corte paneles)
  const centerRef = useRef(null);
  const [viewportPx, setViewportPx] = useState(900);

  const [showReferencePoints, setShowReferencePoints] = useState(true); // variable para mostrar puntos definidos por el robot
  const referencePoints = useMemo(
    () =>
      normalizeReferencePoints([
        { name: "HZ", x: -991.811, y: -177.128 },
        { name: "Tomacaja2", x: -1463.567, y: -83.505 },
        { name: "Tomacaja1", x: -1463.577, y: -83.493 },
        { name: "TransR1", x: -749.996, y: 1000.005 },
        { name: "PalletRbox1", x: 216.998, y: 634.997 },
        { name: "PalletRbox21", x: 167.011, y: 585.010 },
      ]),
    []
  );


  const sectionGroupStyle = {
    border: "1px solid #d1d5db",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    background: "#f9fafb",
  };

  const sectionGroupTitleStyle = {
    fontSize: 12,
    fontWeight: 800,
    color: "#374151",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  };

  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;

      // cuadrado que cabe en la columna central, con límites sanos
      const next = Math.floor(
        clamp(Math.min(r.width, window.innerHeight - 140), 520, 1600)
      );
      setViewportPx(next);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);



  // Zoom + Pan (cámara)
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // ✅ PAN (arrastrar fondo para mover cámara)
  const panDragRef = useRef({
    active: false,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
  });

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


  // Panel add floors and Z value
  const [floorPanelOpen, setFloorPanelOpen] = useState(false);
  const [newFloorNumber, setNewFloorNumber] = useState(1);
  const [newFloorZ, setNewFloorZ] = useState(-900);
  const [newFloorColor, setNewFloorColor] = useState("#2563eb");
  const [floorDefs, setFloorDefs] = useState([]);


  
  const [newFloorSelected, setNewFloorSelected] = useState(1);


  useEffect(() => {
    if (!floorDefs || floorDefs.length === 0) return;

    const exists = floorDefs.some((f) => f.floor === newFloorSelected);
    if (!exists) {
      setNewFloorSelected(floorDefs[0].floor);
    }
  }, [floorDefs, newFloorSelected]);


  const [referencePaintPanelOpen, setReferencePaintPanelOpen] = useState(true);
  // Workspace
  const [workspaceXmm, setWorkspaceXmm] = useState(5000);
  const [workspaceYmm, setWorkspaceYmm] = useState(5200);
  const [workspaceOriginXmm, setWorkspaceOriginXmm] = useState(0);
  const [workspaceOriginYmm, setWorkspaceOriginYmm] = useState(0);

  // Grid
  const [gridMm, setGridMm] = useState(10);
  const [majorGridMm, setMajorGridMm] = useState(50);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Coordenadas visibles
  const [showCoords, setShowCoords] = useState(true);
  const [coordStepMm, setCoordStepMm] = useState(200);
  const [coordFontPx, setCoordFontPx] = useState(13);

  // Form agregar área azul
  const [newLabel, setNewLabel] = useState("B1");
  const [newXY, setNewXY] = useState("(417, -635)");
  const [newW, setNewW] = useState(300);
  const [newH, setNewH] = useState(400);
  const [addOneError, setAddOneError] = useState("");

  // Paint areas textarea
  const [paintEnabled, setPaintEnabled] = useState(true);
  const [paintPanelOpen, setPaintPanelOpen] = useState(false);
  const [blueAreasPanelOpen, setBlueAreasPanelOpen] = useState(false);
  const [luaPanelOpen, setLuaPanelOpen] = useState(false);


  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);


  const [blueAreasFloorFilter, setBlueAreasFloorFilter] = useState("ALL");

  const [paintAreasText, setPaintAreasText] = useState(
    "Robot,(-623,-425),(-623,425),(377,425),(377,-425)\nRLeft,(-623,-425),(-623,-1625),(377,-1625),(377,-425),\nRRight,(-623,425),(-623,1625),(377,1625),(377,425)"
  );
  const [paintAreas, setPaintAreas] = useState(() => []);
  const [paintAreasError, setPaintAreasError] = useState("");

  // ✅ NUEVO: estados LUA (Piso 1)
  const [luaFloor1Text, setLuaFloor1Text] = useState("");

  const importProjectInputRef = useRef(null);

  // Scale (usando viewportPx)
  const baseScale = useMemo(() => {
    const pad = 16;
    const usableW = Math.max(1, viewportPx - pad * 2);
    const usableH = Math.max(1, viewportPx - pad * 2);
    const sx = usableW / workspaceXmm;
    const sy = usableH / workspaceYmm;
    return Math.min(sx, sy);
  }, [workspaceXmm, workspaceYmm, viewportPx]);

  const scale = useMemo(() => baseScale * zoom, [baseScale, zoom]);

  const pxDeltaToMmDelta = (dxPx, dyPx) => ({
    dx_mm: -dxPx / scale,
    dy_mm: dyPx / scale,
  });

  const stopAreaDrag = () => {
    areaDragRef.current.active = false;
    areaDragRef.current.id = "";
    areaDragRef.current.startPoints = [];
  };

  const stopPan = () => {
    panDragRef.current.active = false;
  };

  const canvasCenterPx = useMemo(() => {
    return {
      x: viewportPx / 2 + pan.x,
      y: viewportPx / 2 + pan.y,
    };
  }, [viewportPx, pan.x, pan.y]);

  // ✅ px -> mm
  const pxToMm = (x_px, y_px) => {
    // X invertido
    const x_rel = (canvasCenterPx.x - x_px) / scale;

    // Y invertido
    const y_rel = (y_px - canvasCenterPx.y) / scale;

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

      // X invertido: izquierda +X, derecha -X
      const x_px = canvasCenterPx.x - x_rel * scale;

      // Y invertido: arriba -Y, abajo +Y
      const y_px = canvasCenterPx.y + y_rel * scale;

      return { x_px, y_px };
    };

  const workspaceBorderPx = useMemo(() => {
    const p1 = mmToPx(limits.minX, limits.maxY);
    const p2 = mmToPx(limits.maxX, limits.minY);

    const left = Math.min(p1.x_px, p2.x_px);
    const top = Math.min(p1.y_px, p2.y_px);
    const w = Math.abs(p2.x_px - p1.x_px);
    const h = Math.abs(p2.y_px - p1.y_px);

    return { left, top, w, h };
  }, [limits.minX, limits.maxX, limits.minY, limits.maxY, mmToPx]);

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
    mmToPx,
  ]);

  // ✅ Coordenadas visibles (SIN scroll)
  const coordLabels = useMemo(() => {
    if (!showCoords) return { xs: [], ys: [], usedStepMm: coordStepMm };

    const step = Math.max(10, Math.round(coordStepMm / 10) * 10);

    const leftPx = 0;
    const topPx = 0;
    const rightPx = viewportPx;
    const bottomPx = viewportPx;

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
        y: viewportPx - 12,
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
  }, [showCoords, coordStepMm, viewportPx, pxToMm, mmToPx]);

  const axes = useMemo(() => {
    const xA = mmToPx(limits.minX, 0);
    const xB = mmToPx(limits.maxX, 0);
    const yA = mmToPx(0, limits.minY);
    const yB = mmToPx(0, limits.maxY);

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
    mmToPx,
  ]);

  const axisDirectionLabels = useMemo(() => {
    const margin = 42; // antes 22
    const cx = viewportPx / 2;
    const cy = viewportPx / 2;

    return {
      top: {
        x: cx,
        y: margin,
        text: "-Y",
      },
      bottom: {
        x: cx,
        y: viewportPx - margin,
        text: "+Y",
      },
      left: {
        x: margin,
        y: cy,
        text: "+X",
      },
      right: {
        x: viewportPx - margin,
        y: cy,
        text: "-X",
      },
    };
  }, [viewportPx]);


  function getSuggestedFloorZBase(floorNumber) {
    const itemZ = 300; // altura de cada piso
    return -900 + (Math.max(1, Number(floorNumber)) - 1) * itemZ;
  }

  function saveFloorDef() {
    const floor = Number(newFloorNumber);
    const zBase = Number(newFloorZ);
    const color = String(newFloorColor || "").trim();

    if (!Number.isFinite(floor) || floor < 1) return;
    if (!Number.isFinite(zBase)) return;
    if (!color) return;

    setFloorDefs((prev) => {
      const exists = prev.some((f) => f.floor === floor);

      if (exists) {
        return prev
          .map((f) => (f.floor === floor ? { ...f, zBase, color } : f))
          .sort((a, b) => a.floor - b.floor);
      }

      return [...prev, { floor, zBase, color }].sort((a, b) => a.floor - b.floor);
    });
  }

  function deleteFloorDef(floorNumber) {
    setFloorDefs((prev) => prev.filter((f) => f.floor !== floorNumber));
  }


  function exportProjectToJson() {
    const projectData = {
      floors: floorDefs ?? [],
      areas: (paintAreas ?? [])
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
        }),
    };

    downloadJsonFile("proyecto_robot.json", projectData);
  }




  function importProjectFromFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const rawText = String(evt.target?.result ?? "");
        const data = JSON.parse(rawText);

        const importedFloors = Array.isArray(data.floors) ? data.floors : [];
        const importedAreas = Array.isArray(data.areas) ? data.areas : [];

        const rebuiltAreas = importedAreas.map((a, idx) => {
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
              `imported-${idx}-${Date.now()}`,
            label: truncateLabel5(a.label) || `B${idx + 1}`,
            points: pts,
            source: "single",
            floor: Number(a.floor ?? 1),
            rotationDeg,
          };
        });

        setFloorDefs(importedFloors);
        setPaintAreas(rebuiltAreas);
        setSelectedAreaId("");
        setNewLabel(getNextBlueLabel(rebuiltAreas));
        setAddOneError("");
        setPaintAreasError("");
      } catch (err) {
        console.error("Error importing project:", err);
        alert("Error al cargar el archivo del proyecto.");
      }
    };

    reader.readAsText(file);
  }

  function getFloorColor(floor) {
    const found = floorDefs.find((f) => f.floor === floor);
    return found?.color || "#2563eb";
  }

  function areaSummaryPointMmRaw(area) {
    const poly = area?.points ?? [];
    const p = findInteriorPoint(poly);
    return { x: p.x, y: p.y };
  }

  function areaSummaryPointMm(area) {
    const p = areaSummaryPointMmRaw(area);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

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

  const onAreaContextMenu = (e, areaId) => {
    e.preventDefault();
    e.stopPropagation();
    openAreaEditorAt(e.clientX, e.clientY, areaId);
  };

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



  function rotateArea90(areaId) {
    setPaintAreas((prev) =>
      prev.map((a) => {
        if (a.id !== areaId) return a;
        if (a.source !== "single") return a;

        const rotatedPoints = rotatePolygon(a.points ?? [], 90).map((p) => ({
          x: clamp(p.x, limits.minX, limits.maxX),
          y: clamp(p.y, limits.minY, limits.maxY),
        }));

        return {
          ...a,
          points: rotatedPoints,
          rotationDeg: normalizeRotationDeg((a.rotationDeg ?? 0) + 90),
        };
      })
    );
  }


  function deletePolygon(id) {
    setPaintAreas((prev) => {
      const nextAreas = prev.filter((a) => a.id !== id);
      setNewLabel(getNextBlueLabel(nextAreas));
      return nextAreas;
    });

    setSelectedAreaId((cur) => (cur === id ? "" : cur));
    setAreaMenu((m) =>
      m.areaId === id ? { ...m, open: false, areaId: "" } : m
    );
  }

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

  const onAreaDragMove = (e) => {
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

  // ✅ PAN handlers
  const onPanPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    panDragRef.current.active = true;
    panDragRef.current.startClientX = e.clientX;
    panDragRef.current.startClientY = e.clientY;
    panDragRef.current.startPanX = pan.x;
    panDragRef.current.startPanY = pan.y;

    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPanPointerMove = (e) => {
    if (!panDragRef.current.active) return;

    const dx = e.clientX - panDragRef.current.startClientX;
    const dy = e.clientY - panDragRef.current.startClientY;

    setPan({
      x: panDragRef.current.startPanX + dx,
      y: panDragRef.current.startPanY + dy,
    });
  };

  // ✅ zoom con rueda
  const onWheelZoom = (e) => {
    e.preventDefault();
    const delta = e.deltaY;
    setZoom((z) => {
      const next = delta > 0 ? z - 0.1 : z + 0.1;
      return clamp(next, 1, 4);
    });
  };

  // ✅ Router de eventos SVG (PAN + Drag áreas)
  const onSvgPointerMove = (e) => {
    if (areaDragRef.current.active) {
      onAreaDragMove(e);
      return;
    }
    onPanPointerMove(e);
  };

  const onSvgPointerUp = () => {
    stopPan();
    stopAreaDrag();
  };

  const onSvgPointerLeave = () => {
    stopPan();
    stopAreaDrag();
  };

  const onSvgPointerCancel = () => {
    stopPan();
    stopAreaDrag();
  };

  const addOnePoint = () => {
    setAddOneError("");

    const rawLabel = truncateLabel5(newLabel) || "AREA";
    const label = normalizeLabel(rawLabel);

    if (!floorDefs || floorDefs.length === 0) {
      setAddOneError("Debes definir al menos un piso antes de agregar un área azul.");
      return;
    }

    const labelExists = (paintAreas ?? []).some(
      (a) => a.source === "single" && normalizeLabel(a.label) === label
    );

    if (labelExists) {
      setAddOneError(`El label ${label} ya existe. Usa otro.`);
      return;
    }

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

    const newArea = {
      id: newAreaId,
      label,
      points: pts,
      source: "single",
      floor: newFloorSelected,
      rotationDeg: 0,
    };

    setPaintAreas((prev) => {
      const nextAreas = [...prev, newArea];
      setNewLabel(getNextBlueLabel(nextAreas));
      return nextAreas;
    });

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

      const ptsPx = polyMm.map((p) => {
        const pp = mmToPx(p.x, p.y);
        return { x_px: pp.x_px, y_px: pp.y_px };
      });
      const pointsAttr = ptsPx.map((p) => `${p.x_px},${p.y_px}`).join(" ");

      let minX = Infinity;
      let maxY = -Infinity;
      for (const p of polyMm) {
        if (p.x < minX) minX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const centerMm = findInteriorPoint(polyMm);
      const labelPx = mmToPx(centerMm.x, centerMm.y);
      const labelCenterPx = labelPx;
      const labelTopLeftPx = labelPx;

      return {
        id: area.id,
        label: truncateLabel5(area.label) || "AREA",
        source: area.source ?? "csv",
        floor: area.floor ?? null,
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

  // ✅ listado de áreas azules (source === "single")
  const blueAreasList = useMemo(() => {
  const list = (paintAreasSvg ?? [])
    .filter((a) => a.source === "single")
    .map((a) => {
      const raw = paintAreas.find((p) => p.id === a.id);
      return {
        id: a.id,
        label: truncateLabel5(a.label) || "AREA",
        x: a.summary.x_mm,
        y: a.summary.y_mm,
        floor: raw?.floor ?? 1,
        rotationDeg: raw?.rotationDeg ?? 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return list;
}, [paintAreasSvg, paintAreas]);

  


  const filteredBlueAreasList = useMemo(() => {
    if (blueAreasFloorFilter === "ALL") return blueAreasList;

    return blueAreasList.filter(
      (b) => String(b.floor) === String(blueAreasFloorFilter)
    );
  }, [blueAreasList, blueAreasFloorFilter]);



  const filteredPaintAreasSvg = useMemo(() => {
    if (blueAreasFloorFilter === "ALL") return paintAreasSvg;

    return (paintAreasSvg ?? []).filter((a) => {
      if (a.source !== "single") return true;
      return String(a.floor) === String(blueAreasFloorFilter);
    });
  }, [paintAreasSvg, blueAreasFloorFilter]);

  const referencePointsSvg = useMemo(() => {
    if (!showReferencePoints) return [];

    return referencePoints
      .map((p) => {
        const px = mmToPx(p.x, p.y);
        return {
          ...p,
          x_px: px.x_px,
          y_px: px.y_px,
        };
      })
      .filter(
        (p) =>
          Number.isFinite(p.x_px) &&
          Number.isFinite(p.y_px)
      );
  }, [showReferencePoints, referencePoints, mmToPx]);

  const coordBox = useMemo(() => {
    const fs = clamp(Number(coordFontPx) || 5, 4, 16);
    return { fs, ...labelBoxForValue("-9999", fs, 3, 2) };
  }, [coordFontPx]);


  const blueLineDy = clamp(12 / zoom, 9, 14);

  return (
  <div
    style={{
      padding: 16,
      display: "grid",
      //gridTemplateColumns: "240px minmax(520px, 1fr) 360px",
      gridTemplateColumns: "minmax(520px, 1fr) 360px",
      gap: 16,
      width: "100%",
      maxWidth: "100vw",
      overflowX: "hidden",
      boxSizing: "border-box",
      alignItems: "start",
      background: "#f6f7fb",
      color: "#1f2937",
      fontFamily: "Inter, system-ui, Arial, sans-serif",
      minHeight: "100vh",
    }}
  >
      {/* IZQUIERDA */}
      {/*
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 10,
          overflow: "auto",
          maxHeight: "calc(100vh - 32px)",
          position: "sticky",
          top: 16,
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
              onChange={(e) => setGridMm(Math.max(1, Number(e.target.value || 1)))}
            />

            <label style={{ fontSize: 12, color: "#333" }}>major_grid_mm</label>
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
*/}

      {/* CENTRO */}
      <div
        ref={centerRef}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "4px 12px",
          overflow: "auto",
          maxHeight: "calc(100vh - 32px)",
          fontSize: 13,
          position: "sticky",
          top: 16,
          background: "#ffffff",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
          

          {/* ✅ VIEWPORT responsivo SIN SCROLL */}
          <div
            style={{
              width: viewportPx,
              height: viewportPx,
            border: "1px solid #cfcfcf",
            borderRadius: 8,
            background: "#fff",
            overflow: "hidden",
            position: "relative",
            touchAction: "none",
          }}
        >
          <svg
          ref={svgRef}
          width={viewportPx}
          height={viewportPx}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
          }}
            onPointerDown={onPanPointerDown}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerLeave={onSvgPointerLeave}
            onPointerCancel={onSvgPointerCancel}
            onWheel={onWheelZoom}
          >
            {/* borde workspace */}
            <rect
              x={workspaceBorderPx.left}
              y={workspaceBorderPx.top}
              width={workspaceBorderPx.w}
              height={workspaceBorderPx.h}
              fill="none"
              stroke="#999"
              strokeWidth={2}
              strokeDasharray="6 6"
              pointerEvents="none"
            />

            {/* PUNTOS REFERENCIALES */}
            

            {gridLines.map((ln) => (
              <line
                key={ln.key}
                x1={ln.x1}
                y1={ln.y1}
                x2={ln.x2}
                y2={ln.y2}
                stroke={ln.major ? "#d2d2d2" : "#efefef"}
                strokeWidth={ln.major ? 1.2 : 1}
                pointerEvents="none"
              />
            ))}

            <line
              x1={axes.x1}
              y1={axes.y1}
              x2={axes.x2}
              y2={axes.y2}
              stroke="#ff4d4d"
              strokeWidth={2}
              pointerEvents="none"
            />
            <line
              x1={axes.yx1}
              y1={axes.yy1}
              x2={axes.yx2}
              y2={axes.yy2}
              stroke="#ff4d4d"
              strokeWidth={2}
              pointerEvents="none"
            />

            {/* etiquetas dirección ejes */}
            <g pointerEvents="none">
              <rect
                x={axisDirectionLabels.top.x - 22}
                y={axisDirectionLabels.top.y - 11}
                width={44}
                height={22}
                rx={4}
                fill="rgba(255,255,255,0.88)"
              />
              <text
                x={axisDirectionLabels.top.x}
                y={axisDirectionLabels.top.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="16"
                fontFamily="monospace"
                fontWeight="900"
                fill="#dc2626"
                style={{ userSelect: "none" }}
              >
                {axisDirectionLabels.top.text}
              </text>

              <rect
                x={axisDirectionLabels.bottom.x - 22}
                y={axisDirectionLabels.bottom.y - 11}
                width={44}
                height={22}
                rx={4}
                fill="rgba(255,255,255,0.88)"
              />
              <text
                x={axisDirectionLabels.bottom.x}
                y={axisDirectionLabels.bottom.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="16"
                fontFamily="monospace"
                fontWeight="900"
                fill="#dc2626"
                style={{ userSelect: "none" }}
              >
                {axisDirectionLabels.bottom.text}
              </text>

              <rect
                x={axisDirectionLabels.left.x - 22}
                y={axisDirectionLabels.left.y - 11}
                width={44}
                height={22}
                rx={4}
                fill="rgba(255,255,255,0.88)"
              />
              <text
                x={axisDirectionLabels.left.x}
                y={axisDirectionLabels.left.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="16"
                fontFamily="monospace"
                fontWeight="900"
                fill="#dc2626"
                style={{ userSelect: "none" }}
              >
                {axisDirectionLabels.left.text}
              </text>

              <rect
                x={axisDirectionLabels.right.x - 22}
                y={axisDirectionLabels.right.y - 11}
                width={44}
                height={22}
                rx={4}
                fill="rgba(255,255,255,0.88)"
              />
              <text
                x={axisDirectionLabels.right.x}
                y={axisDirectionLabels.right.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="16"
                fontFamily="monospace"
                fontWeight="900"
                fill="#dc2626"
                style={{ userSelect: "none" }}
              >
                {axisDirectionLabels.right.text}
              </text>
            </g>

            {/* coords */}
            {showCoords ? (
              <g pointerEvents="none">
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
                        style={{ userSelect: "none" }}
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
                        style={{ userSelect: "none" }}
                      >
                        {t.value}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : null}

            {/* ÁREAS */}
            {filteredPaintAreasSvg.map((a) => {
              const floorColor = getFloorColor(a.floor);

              const fillColor =
                a.source === "single"
                  ? `${floorColor}22`
                  : "rgba(255,140,0,0.10)";

              const strokeColor =
                a.source === "single"
                  ? floorColor
                  : "rgba(255,140,0,0.70)";

              const selectedStrokeColor =
                a.source === "single"
                  ? floorColor
                  : "rgba(255,140,0,0.95)";

              return (
                <g key={a.id}>
                  <polygon
                    points={a.pointsAttr}
                    fill={fillColor}
                    stroke={a.id === selectedAreaId ? selectedStrokeColor : strokeColor}
                    strokeWidth="2"
                    style={{
                      cursor: areaDragRef.current.active ? "grabbing" : "grab",
                    }}
                    onPointerDown={(e) => onAreaPointerDown(e, a.id)}
                    onContextMenu={(e) => onAreaContextMenu(e, a.id)}
                  />

                  <g pointerEvents="none">
                    <text
                      x={a.labelCenterPx.x_px}
                      y={a.labelCenterPx.y_px}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={a.source === "single" ? 12 : 10}
                      fontFamily="monospace"
                      fontWeight={900}
                      fill="#111"
                      style={{ userSelect: "none" }}
                    >
                      {a.label}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* ORIGIN */}
            {(() => {
              const o = mmToPx(0, 0);
              return (
                <g pointerEvents="none">
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
                    style={{ userSelect: "none" }}
                  >
                    ORIGIN (0,0)
                  </text>
                </g>
              );
            })()}
          </svg>

            {showReferencePoints &&
              referencePointsSvg.map((p) => {
                const n = String(p.name || "").toUpperCase();

                let shape = "circle";
                let color = "#16a34a";

                if (n === "HZ") {
                  shape = "diamond";
                  color = "#dc2626";
                } else if (n === "TOMACAJA1") {
                  shape = "circle";
                  color = "#1618a3";
                } else if (n === "TOMACAJA2") {
                  shape = "triangle";
                  color = "#16a34a";
                } else if (n.startsWith("TRANS")) {
                  shape = "triangle";
                  color = "#f97316";
                } else if (n.startsWith("PALLET")) {
                  shape = "square";
                  color = "#9333ea";
                }

                const left = Math.round(p.x_px);
                const top = Math.round(p.y_px);

                return (
                  <div
                    key={`ref-${p.name}`}
                    style={{
                      position: "absolute",
                      left,
                      top,
                      width: 0,
                      height: 0,
                      pointerEvents: "none",
                    }}
                  >
                    {shape === "circle" && (
                      <div
                        style={{
                          position: "absolute",
                          left: -6,
                          top: -6,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: color,
                          border: "2px solid white",
                          boxSizing: "border-box",
                        }}
                      />
                    )}

                    {shape === "square" && (
                      <div
                        style={{
                          position: "absolute",
                          left: -6,
                          top: -6,
                          width: 12,
                          height: 12,
                          background: color,
                          border: "2px solid white",
                          boxSizing: "border-box",
                        }}
                      />
                    )}

                    {shape === "diamond" && (
                      <div
                        style={{
                          position: "absolute",
                          left: -6,
                          top: -6,
                          width: 12,
                          height: 12,
                          background: color,
                          border: "2px solid white",
                          boxSizing: "border-box",
                          transform: "rotate(45deg)",
                          transformOrigin: "center",
                        }}
                      />
                    )}

                    {shape === "triangle" && (
                      <div
                        style={{
                          position: "absolute",
                          left: -7,
                          top: -7,
                          width: 0,
                          height: 0,
                          borderLeft: "7px solid transparent",
                          borderRight: "7px solid transparent",
                          borderBottom: `14px solid ${color}`,
                          filter: "drop-shadow(0 0 0 white)",
                        }}
                      />
                    )}
                  </div>
                );
              })}

        </div>
      </div>

      {/* DERECHA */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "2px 12px",
          overflow: "auto",
          maxHeight: "calc(100vh - 32px)",
          fontSize: 13,
          position: "sticky",
          top: 16,
          background: "#ffffff",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >

        

        


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

                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  Label (máx 5)
                </div>
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
                      borderRadius: 8,
                      border: "none",
                      background: "#dc2626",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })()}

        



        <div
          style={{
            paddingTop: 12,
          }}
        >



          <div
  style={{
    
    paddingTop: 12,
    marginTop: 12,
  }}
>

<div style={sectionGroupStyle}>
  <div style={sectionGroupTitleStyle}>Configuración y áreas</div>

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    }}
  >
    <div style={{ fontWeight: 900 }}>Pisos y altura Z</div>

    <button
      onClick={() => setFloorPanelOpen((v) => !v)}
      style={{
        border: "1px solid #0f766e",
        background: floorPanelOpen ? "#0f766e" : "#ccfbf1",
        color: floorPanelOpen ? "#ffffff" : "#115e59",
        borderRadius: 6,
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {floorPanelOpen ? "Cerrar ▲" : "Abrir ▼"}
    </button>
  </div>




            <div
              style={{
                paddingTop: 12,
                marginTop: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 900 }}>Agregar (crea área azul)</div>

                <button
                  onClick={() => setAddPanelOpen((v) => !v)}
                  style={{
                    border: "1px solid #2563eb",
                    background: addPanelOpen ? "#2563eb" : "#dbeafe",
                    color: addPanelOpen ? "#ffffff" : "#1d4ed8",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {addPanelOpen ? "Cerrar ▲" : "Abrir ▼"}
                </button>
              </div>


  {floorPanelOpen && (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div>
          <label style={{ fontSize: 12, color: "#333" }}>Piso</label>
          <input
            type="number"
            min={1}
            value={newFloorNumber}
            onChange={(e) => {
              const nextFloor = Number(e.target.value || 1);
              setNewFloorNumber(nextFloor);
              setNewFloorZ(getSuggestedFloorZBase(nextFloor));
            }}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: "#333" }}>Z base (mm)</label>
          <input
            type="number"
            value={newFloorZ}
            onChange={(e) => setNewFloorZ(Number(e.target.value || 0))}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: "#333" }}>Color</label>
          <input
            type="color"
            value={newFloorColor}
            onChange={(e) => setNewFloorColor(e.target.value)}
            style={{ width: "100%", height: 38, padding: 2 }}
          />
        </div>
      </div>

      <button
        onClick={saveFloorDef}
        style={{
          width: "100%",
          padding: "8px 10px",
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        Guardar piso
      </button>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 8,
          background: "#fafafa",
          display: "grid",
          gap: 6,
        }}
      >
        {floorDefs.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>
            No hay pisos definidos.
          </div>
        ) : (
          floorDefs.map((f) => (
            <div
              key={f.floor}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                borderBottom: "1px solid #eee",
                paddingBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: f.color,
                    border: "1px solid #999",
                    display: "inline-block",
                    borderRadius: 3,
                  }}
                />
                <span>
                  <b>Piso {f.floor}</b> — Z base: {f.zBase} mm
                </span>
              </div>

              <button
                onClick={() => deleteFloorDef(f.floor)}
                style={{
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Eliminar
              </button>
            </div>
          ))
        )}
      </div>
    </>
  )}
</div>



{addPanelOpen && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 8,
                    }}
                  >
                    <div>
                      <label style={{ fontSize: 12, color: "#333", display: "block", marginBottom: 4 }}>
                        label (máx 5):
                      </label>
                      <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="B1"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d0d5dd",
                          background: "#fff",
                          color: "#111827",
                          fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: "#333", display: "block", marginBottom: 4 }}>
                        coordenadas (x,y):
                      </label>
                      <input
                        value={newXY}
                        onChange={(e) => setNewXY(e.target.value)}
                        placeholder="(43, 544)"
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d0d5dd",
                          background: "#fff",
                          color: "#111827",
                          fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: "#333", display: "block", marginBottom: 4 }}>
                        piso:
                      </label>
                      <select
                        value={newFloorSelected}
                        onChange={(e) => setNewFloorSelected(Number(e.target.value))}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #d0d5dd",
                          background: "#fff",
                          color: "#111827",
                          fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      >
                        {floorDefs.map((f) => (
                          <option key={f.floor} value={f.floor}>
                            Piso {f.floor}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div>
                        <label style={{ fontSize: 12, color: "#333", display: "block", marginBottom: 4 }}>
                          ancho (mm):
                        </label>
                        <input
                          type="number"
                          value={newW}
                          onChange={(e) => setNewW(Number(e.target.value || 0))}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d0d5dd",
                            background: "#fff",
                            color: "#111827",
                            fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, color: "#333", display: "block", marginBottom: 4 }}>
                          alto (mm):
                        </label>
                        <input
                          type="number"
                          value={newH}
                          onChange={(e) => setNewH(Number(e.target.value || 0))}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d0d5dd",
                            background: "#fff",
                            color: "#111827",
                            fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
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
                      padding: "9px 12px",
                      cursor: "pointer",
                      width: "100%",
                      borderRadius: 8,
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    Agregar (crea área azul)
                  </button>
                </>
              )}







        {/* ✅ lista de áreas azules */}
          <div
            style={{
              paddingTop: 12,
              marginTop: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900 }}>
                Items agregadas ({filteredBlueAreasList.length})
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  value={blueAreasFloorFilter}
                  onChange={(e) => setBlueAreasFloorFilter(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #d0d5dd",
                    background: "#fff",
                    color: "#111827",
                    fontSize: 12,
                  }}
                >
                  <option value="ALL">Todos</option>
                  {floorDefs.map((f) => (
                    <option key={f.floor} value={String(f.floor)}>
                      Piso {f.floor}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setBlueAreasPanelOpen((v) => !v)}
                  style={{
                    border: "1px solid #3d3d42",
                    background: blueAreasPanelOpen ? "#dc2626" : "#fee2e2",
                    color: blueAreasPanelOpen ? "#ffffff" : "#991b1b",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {blueAreasPanelOpen ? "Cerrar ▲" : "Abrir ▼"}
                </button>
              </div>
            </div>

            {blueAreasPanelOpen && (
            <div
              style={{
                border: "3px dashed #ff00ff",
                borderRadius: 8,
                padding: 10,
                minHeight: 120,
                background: "#4c4949",
                color: "#ffffff",
                display: "grid",
                gap: 8,
              }}
            >
              {filteredBlueAreasList.length === 0 ? (
                <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                  — (no hay áreas azules para ese piso) —
                </div>
              ) : (
                filteredBlueAreasList.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: 8,
                      padding: 8,
                      display: "grid",
                      gap: 6,
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                      {b.label}, piso={b.floor}, (x={b.x}, y={b.y}), rot={b.rotationDeg}°, zBase={floorDefs.find(f => Number(f.floor) === Number(b.floor))?.zBase ?? -900}
                    </div>

                    <button
                      onClick={() => rotateArea90(b.id)}
                      style={{
                        padding: "6px 8px",
                        cursor: "pointer",
                        borderRadius: 6,
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Girar 90°
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          </div>


</div>



<div style={sectionGroupStyle}>
  <div style={sectionGroupTitleStyle}>Grupo 2 · Mapa Robot y Pallets</div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={paintEnabled}
                  onChange={(e) => setPaintEnabled(e.target.checked)}
                />
                Mostrar
              </label>

              <button
                onClick={() => setPaintPanelOpen((v) => !v)}
                style={{
                  border: "1px solid #2563eb",
                  background: paintPanelOpen ? "#2563eb" : "#dbeafe",
                  color: paintPanelOpen ? "#ffffff" : "#1d4ed8",
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {paintPanelOpen ? "Cerrar ▲" : "Abrir ▼"}
              </button>
            </div>
          </div>

          {paintPanelOpen && (
            <>
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
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Aplicar áreas
              </button>

              <div
                style={{
                  marginTop: 8,
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#555",
                }}
              >
                áreas cargadas: {paintAreas?.length ?? 0}
              </div>
            </>
          )}
        </div>




              
            </div>




      {/* codigo agregar pisos */}
</div>







<div style={sectionGroupStyle}>
  <div style={sectionGroupTitleStyle}>Generar Lua

          <button
      onClick={() => setLuaPanelOpen((v) => !v)}
      style={{
        border: "1px solid #7c3aed",
        background: luaPanelOpen ? "#7c3aed" : "#ede9fe",
        color: luaPanelOpen ? "#ffffff" : "#5b21b6",
        borderRadius: 6,
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {luaPanelOpen ? "Cerrar ▲" : "Abrir ▼"}
    </button>


  </div>

        {/* ✅ NUEVO: GENERAR LUA PISO 1 */}
        <div
  style={{
    paddingTop: 12,
    marginTop: 12,
  }}
>

  
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    }}
  >
    

    
  </div>

  {luaPanelOpen && (
    <>


      <button
        onClick={() => {
          const boxes = sortBoxesForLua(
          (paintAreas ?? [])
            .filter((a) => a.source === "single")
            .filter((a) =>
              blueAreasFloorFilter === "ALL"
                ? true
                : String(a.floor) === String(blueAreasFloorFilter)
            )
            .map((a) => {
              const p = areaSummaryPointMm(a);
              const floorNumber = a.floor ?? 1;
              const floorDef = floorDefs.find((f) => Number(f.floor) === Number(floorNumber));

              return {
                id: a.id,
                label: a.label,
                x: p.x,
                y: p.y,
                floor: floorNumber,
                rotationDeg: a.rotationDeg ?? 0,
                zBase: Number(floorDef?.zBase ?? -900),
              };
            })
        );

          const lua = generateLuaFloor1({ boxes });
          setLuaFloor1Text(lua);
        }}
        style={{
          marginTop: 10,
          padding: "8px 10px",
          cursor: "pointer",
          width: "100%",
        }}
      >
        Generar secuencia Piso 1
      </button>

      <textarea
        value={luaFloor1Text}
        readOnly
        rows={12}
        style={{
          width: "100%",
          marginTop: 10,
          fontFamily: "monospace",
          fontSize: 12,
          padding: 8,
          boxSizing: "border-box",
          borderRadius: 8,
          border: "2px dashed #ff00ff",
          background: "#7f1d1d",
          color: "#ffffff",
        }}
      />


      <button
        onClick={() => {
          if (!luaFloor1Text.trim()) {
            alert("Primero genera el código LUA.");
            return;
          }
          downloadTextFile("piso1_lua.txt", luaFloor1Text);
        }}
        style={{
          marginTop: 8,
          padding: "8px 10px",
          cursor: "pointer",
          width: "100%",
          borderRadius: 8,
          border: "none",
          background: "#16a34a",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Exportar LUA (.txt)
      </button>


    </>
  )}
        </div>
        {/* ✅ FIN: GENERAR LUA PISO 1 */}
  </div>


<div style={sectionGroupStyle}>
  <div style={sectionGroupTitleStyle}>Proyectos (Importar y Exportar)
        {/* ✅ Begin: Importar y exportar distribución*/}

        <button
        onClick={() => setProjectPanelOpen((v) => !v)}
        style={{
          border: "1px solid #7c3aed",
          background: projectPanelOpen ? "#7c3aed" : "#ede9fe",
          color: projectPanelOpen ? "#ffffff" : "#5b21b6",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {projectPanelOpen ? "Cerrar ▲" : "Abrir ▼"}
      </button>
  <div
    style={{
      paddingTop: 12,
      marginTop: 12,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
      }}
    >
      


      

      
    </div>

    {projectPanelOpen && (
      <div style={{ display: "grid", gap: 8 }}>
        <button
          onClick={exportProjectToJson}
          style={{
            padding: "8px 10px",
            cursor: "pointer",
            width: "100%",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Guardar proyecto (.json)
        </button>

        <button
          onClick={() => importProjectInputRef.current?.click()}
          style={{
            padding: "8px 10px",
            cursor: "pointer",
            width: "100%",
            borderRadius: 8,
            border: "none",
            background: "#7c3aed",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Cargar proyecto (.json)
        </button>

        <input
          ref={importProjectInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            importProjectFromFile(file);
            e.target.value = "";
          }}
        />
      </div>
    )}


  </div>
        {/* ✅ END: Importar y exportar distribución*/}
  </div>
</div>



      </div>
    </div>
  );
}