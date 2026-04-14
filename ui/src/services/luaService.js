import { sortBoxesForLua } from "../utils/sorting";
import { parseBoxNumber } from "../utils/labels";
import { normalizeRotationDeg, findInteriorPoint } from "../utils/geometry";

export function generateLuaFloor({ boxes, floorNumber }) {
  const lines = [];

  lines.push(`-- ####### PISO ${floorNumber}  #######`);
  lines.push("");
  lines.push("PTP(HZ,100,-1,0)");
  lines.push("");

  boxes.forEach((b) => {
    const itemX = Math.round(b.x);
    const itemY = Math.round(b.y);

    const rz = normalizeRotationDeg(b.rotationDeg ?? 0);

    let resultadoY = 0;
    let resultadoX = 0;
    let refY = 200;
    let ptpRef = "";

    let itemZ = 300;
    let itemSafeZ = 20;
    let ptpWaitZ = 0;
    let ptpTransicionZ = 0;
    let ptpLeftZ = 0;
    let ptpLeftSafeZ = 0;

    const zBase = Number(b.zBase ?? -900);

    ptpTransicionZ = zBase + itemZ + 200 + refY;
    ptpWaitZ = zBase + itemZ + refY;
    ptpLeftZ = zBase + itemZ;
    ptpLeftSafeZ = zBase + itemZ + itemSafeZ;

    if (itemY < 0) {
      resultadoY = itemY + 424;
      resultadoX = itemX - (-623);
      ptpRef = "PL";
    } else {
      resultadoX = itemX - (-623);
      resultadoY = itemY - 424;
      ptpRef = "PR";
    }

    const boxNumber = parseBoxNumber(b.label);

    lines.push(`-- BOX ${boxNumber} - Valor X: ${resultadoX}= ${itemX} - (-623)`);
    lines.push(`-- BOX ${boxNumber} - Valor Y: ${resultadoY} =${itemY} - 424`);
    lines.push("SetAuxDO(4,0,0,0)");
    lines.push("PTP(PickWait,100,-1,0)");
    lines.push("PTP(PickSafe,100,-1,0)");
    lines.push("PTP(PickPoint,100,-1,0)");
    lines.push("SetAuxDO(4,1,0,0)");
    lines.push("PTP(PickSafe,100,-1,0)");
    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpTransicionZ},0,0,${rz})`);
    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpWaitZ},0,0,${rz})`);
    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpLeftZ},0,0,${rz})`);
    lines.push("SetAuxDO(4,0,0,0)");
    lines.push(`PTP(${ptpRef},100,-1,1,${resultadoX},${resultadoY},${ptpLeftSafeZ},0,0,${rz})`);
    lines.push("");
  });

  return lines.join("\n");
}

export function generateLuaAllFloors({ paintAreas, floorDefs }) {
  const onlyBoxes = (paintAreas ?? []).filter((a) => a.source === "single");

  const floorsInUse = Array.from(
    new Set(onlyBoxes.map((a) => Number(a.floor ?? 1)))
  ).sort((a, b) => a - b);

  const allSections = floorsInUse.map((floorNumber) => {
    const floorDef = (floorDefs ?? []).find(
      (f) => Number(f.floor) === Number(floorNumber)
    );

    const zBaseFromFloor =
      Number(floorDef?.zBase) ||
      (-900 + (Math.max(1, Number(floorNumber)) - 1) * 300);

    const boxes = sortBoxesForLua(
      onlyBoxes
        .filter((a) => Number(a.floor ?? 1) === Number(floorNumber))
        .map((a) => {
          const poly = a.points ?? [];
          const center = findInteriorPoint(poly);

          const xs = poly.map((p) => p.x);
          const ys = poly.map((p) => p.y);

          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          return {
            id: a.id,
            label: a.label,
            x: Math.round(center.x),
            y: Math.round(center.y),
            w: Math.round(maxX - minX),
            h: Math.round(maxY - minY),
            floor: floorNumber,
            rotationDeg: a.rotationDeg ?? 0,
            zBase: zBaseFromFloor,
          };
        })
    );

    return generateLuaFloor({
      boxes,
      floorNumber,
    });
  });

  return allSections.join("\n\n");
}