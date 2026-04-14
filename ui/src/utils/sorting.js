import { parseBoxNumber } from "./labels";

export function sortBlueAreasForList(list) {
  return [...(list || [])].sort((a, b) => {
    const na = parseBoxNumber(a.label);
    const nb = parseBoxNumber(b.label);

    if (na !== nb) return na - nb;
    return String(a.label).localeCompare(String(b.label));
  });
}

export function sortBoxesForLua(list) {
  return [...(list || [])].sort((a, b) => {
    const na = parseBoxNumber(a.label);
    const nb = parseBoxNumber(b.label);

    if (na !== nb) return na - nb;
    return String(a.label).localeCompare(String(b.label));
  });
}