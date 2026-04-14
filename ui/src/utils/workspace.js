export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function snapToStep(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

export function getNextFloorNumber(floorDefs, paintAreas) {
  const floorsFromDefs = (floorDefs ?? [])
    .map((f) => Number(f.floor))
    .filter((n) => Number.isFinite(n));

  const floorsFromAreas = (paintAreas ?? [])
    .filter((a) => a.source === "single")
    .map((a) => Number(a.floor ?? 1))
    .filter((n) => Number.isFinite(n));

  const maxFloor = Math.max(0, ...floorsFromDefs, ...floorsFromAreas);
  return maxFloor + 1;
}

export function getSuggestedFloorZBase(floorNumber) {
  const itemZ = 300;
  return -900 + (Math.max(1, Number(floorNumber)) - 1) * itemZ;
}