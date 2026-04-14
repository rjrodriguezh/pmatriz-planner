import { clamp } from "./workspace";

export function rotatePointAroundCenter(px, py, cx, cy, angleDeg) {
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

export function pointInPolygon(pt, poly) {
  const x = pt.x;
  const y = pt.y;
  let inside = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

export function polygonCentroid(poly) {
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

export function findInteriorPoint(poly) {
  if (!poly || poly.length < 3) return { x: 0, y: 0 };

  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;

  const avg = poly.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  const avgPt = { x: avg.x / poly.length, y: avg.y / poly.length };
  if (pointInPolygon(avgPt, poly)) return avgPt;

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

export function rotatePolygon(points, angleDeg) {
  if (!points || points.length === 0) return points ?? [];

  const center = findInteriorPoint(points);

  return points.map((p) =>
    rotatePointAroundCenter(p.x, p.y, center.x, center.y, angleDeg)
  );
}

export function normalizeRotationDeg(value) {
  const n = Number(value) || 0;

  if (n <= -45) return -90;
  if (n >= 45) return 90;
  return 0;
}

export function rectAreaFromCenter(cx, cy, w, h) {
  const halfW = w / 2;
  const halfH = h / 2;

  const left = cx - halfW;
  const right = cx + halfW;
  const bottom = cy - halfH;
  const top = cy + halfH;

  return [
    { x: left, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
  ];
}

export function getAreaCenter(area) {
  const pts = area?.points ?? [];
  if (!pts.length) return { x: 0, y: 0 };

  const xs = pts.map((p) => Number(p.x || 0));
  const ys = pts.map((p) => Number(p.y || 0));

  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

export function getAreaBBoxSize(area) {
  const pts = area?.points ?? [];
  if (!pts.length) return { w: 300, h: 400 };

  const xs = pts.map((p) => Number(p.x || 0));
  const ys = pts.map((p) => Number(p.y || 0));

  return {
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

export function getRotationDeg(area) {
  const raw = Number(
    area?.rotationDeg ??
      area?.rot ??
      area?.rotation ??
      area?.rz ??
      0
  );

  const normalized = ((raw % 360) + 360) % 360;

  if (normalized === 270) return -90;
  if (normalized === 90) return 90;
  if (normalized === 180) return 0;
  return 0;
}

export function rebuildRectPoints({ x, y, w, h, rotationDeg, limits }) {
  let pts = rectAreaFromCenter(x, y, w, h);

  if (rotationDeg !== 0) {
    pts = rotatePolygon(pts, rotationDeg);
  }

  return pts.map((p) => ({
    x: clamp(p.x, limits.minX, limits.maxX),
    y: clamp(p.y, limits.minY, limits.maxY),
  }));
}