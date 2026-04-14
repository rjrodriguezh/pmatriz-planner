export function getAutoFloorColor(floor) {
  const colors = [
    "#2563eb",
    "#22c55e",
    "#92400e",
    "#f97316",
    "#7c3aed",
    "#c3ed3a",
  ];

  const index = (Number(floor) - 1) % colors.length;
  return colors[index];
}

export function getContrastTextColor(hexColor) {
  if (!hexColor) return "#000";

  const c = hexColor.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);

  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#000000" : "#ffffff";
}