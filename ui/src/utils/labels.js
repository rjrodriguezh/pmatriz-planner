export function truncateLabel5(label) {
  const s = (label ?? "").trim();
  if (!s) return "";
  return s;
}

export function normalizeLabel(label) {
  return String(label ?? "").trim().toUpperCase();
}

export function parseBlueLabelNumber(label) {
  const m = String(label ?? "")
    .trim()
    .toUpperCase()
    .match(/^B(\d+)$/);

  return m ? Number(m[1]) : null;
}

export function parseBoxNumber(label) {
  const m = String(label || "").match(/\d+/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

export function getNextGlobalBlueNumber(areas) {
  const maxNum = Math.max(
    0,
    ...(areas ?? [])
      .filter((a) => a.source === "single")
      .map((a) => parseBlueLabelNumber(a.label))
      .filter((n) => Number.isFinite(n))
  );

  return maxNum + 1;
}

export function getNextBlueLabel(areas) {
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

export function labelBoxForValue(value, fontSizePx, paddingX = 3, paddingY = 2) {
  const s = String(value);
  const charW = fontSizePx * 0.62;
  const w = Math.max(12, Math.ceil(s.length * charW + paddingX * 2));
  const h = Math.max(8, Math.ceil(fontSizePx + paddingY * 2));
  return { w, h, padX: paddingX, padY: paddingY };
}