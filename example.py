import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

# =========================
# PUNTO BASE REAL DEL ROBOT
# =========================
PALLET_BASE_NAME = "PalletRbox1"
PALLET_BASE_X = 216.998
PALLET_BASE_Y = 634.997
PALLET_BASE_Z = -899.868

# =========================
# VARIABLES LUA
# =========================
OFFSETZ = 500
OFFSETZBOX = 300

# =========================
# CAJAS DEL LAYOUT
# x,y son offsets respecto a PalletBase
# =========================
boxes = [
    {"label": "B1", "x": 420,  "y": -630, "w": 300, "h": 150},
    {"label": "B2", "x": 230,  "y": -630, "w": 150, "h": 300},
    {"label": "B3", "x": 40,   "y": -630, "w": 150, "h": 300},
    {"label": "B4", "x": -150, "y": -630, "w": 150, "h": 300},
]

def generate_box_lua(box, pallet_base="PalletBase"):
    x = box["x"]
    y = box["y"]
    label = box["label"]

    lines = []
    lines.append(f"-- {label}")
    lines.append("PTP(Homeespera,100,-1,0)")
    lines.append("PTP(Tomacaja2,100,-1,0)")
    lines.append("PTP(Tomacaja1,100,-1,0)")
    lines.append("SetAuxDO(4,1,0,0)")
    lines.append("WaitMs(1000)")
    lines.append("PTP(Tomacaja2,100,-1,0)")
    lines.append(f"PTP(TransR1,100,-1,1,{x},{y},offsetz+100,0,0,0)")
    lines.append(f"PTP({pallet_base},100,-1,1,{x},{y},offsetz,0,0,0)")
    lines.append(f"PTP({pallet_base},100,-1,1,{x},{y},offsetzbox,0,0,0)")
    lines.append("SetAuxDO(4,0,0,0)")
    lines.append("WaitMs(500)")
    lines.append(f"PTP({pallet_base},100,-1,1,{x},{y},offsetz,0,0,0)")
    lines.append("PTP(Homeespera,100,-1,0)")
    return "\n".join(lines)

def generate_lua(boxes):
    lines = []
    lines.append("-- VARIABLES NECESARIAS")
    lines.append("Offsetx = 0")
    lines.append("offsety = 0")
    lines.append(f"offsetz = {OFFSETZ}")
    lines.append(f"offsetzbox = {OFFSETZBOX}")
    lines.append("PalletBase = PalletRbox1")
    lines.append("SetAuxDO(4,0,0,0)")
    lines.append("")

    for box in boxes:
        lines.append(generate_box_lua(box))
        lines.append("")

    return "\n".join(lines)

def draw_layout(boxes):
    fig, ax = plt.subplots(figsize=(10, 6))

    # dibujar origen/base
    ax.scatter(0, 0, s=100)
    ax.text(0, 0, "PalletBase\n(0,0)", ha="left", va="bottom")

    for box in boxes:
        x = box["x"]
        y = box["y"]
        w = box["w"]
        h = box["h"]
        label = box["label"]

        rect = Rectangle((x, y), w, h, fill=False)
        ax.add_patch(rect)

        cx = x + w / 2
        cy = y + h / 2

        robot_x = PALLET_BASE_X + cx
        robot_y = PALLET_BASE_Y + cy

        ax.text(
            cx,
            cy,
            f"{label}\nlayout=({x},{y})\ncentro=({cx:.1f},{cy:.1f})\nrobot=({robot_x:.1f},{robot_y:.1f})",
            ha="center",
            va="center",
            fontsize=8
        )

    ax.set_title("Layout de cajas respecto a PalletBase")
    ax.set_xlabel("Offset X")
    ax.set_ylabel("Offset Y")
    ax.grid(True)
    ax.axis("equal")
    plt.show()

lua_code = generate_lua(boxes)
print(lua_code)

draw_layout(boxes)