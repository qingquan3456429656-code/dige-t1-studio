// Coordinates are normalized for the diagram. Timings illustrate the order of operations.
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (x) => Math.min(1, Math.max(0, x));
function eased(t, start, end) {
  const x = clamp((t - start) / (end - start));
  return x * x * (3 - 2 * x);
}
export const phases = [
  {
    end: 0.2,
    at: 0.14,
    title: "识站对位",
    note: "读取站标与箱码，微调底盘和托台。",
  },
  {
    end: 0.47,
    at: 0.415,
    title: "牵引装载",
    note: "牵引钩拉入托盘，称重与到位开关确认装载。",
  },
  {
    end: 0.77,
    at: 0.63,
    title: "载箱转运",
    note: "锁箱、降台，再转向并驶向目标站。",
  },
  {
    end: 0.97,
    at: 0.915,
    title: "推箱入位",
    note: "复核空位与预约，沿导轨推入整箱。",
  },
  {
    end: 1.01,
    at: 1,
    title: "双端回执",
    note: "车端空载、站端有箱且牵引头回零后登记交付。",
  },
];
export function hardware(t, returned) {
  const s = returned ? -1 : 1;
  const x =
    -1.5 -
    0.75 * eased(t, 0, 0.14) +
    2.25 * eased(t, 0.47, 0.57) +
    1.48 * eased(t, 0.66, 0.73) +
    0.77 * eased(t, 0.745, 0.8);
  const angle = Math.PI * eased(t, 0.57, 0.66) + (returned ? Math.PI : 0);
  const z =
    0.55 +
    0.27 * eased(t, 0.14, 0.2) -
    0.27 * eased(t, 0.41, 0.47) +
    0.27 * eased(t, 0.8, 0.84);
  const load = eased(t, 0.275, 0.41),
    unload = eased(t, 0.84, 0.935);
  let toteX,
    toteY = 0,
    toteZ = 0.82,
    yaw = 0;
  if (t < 0.41) toteX = mix(-3.58, -2.45, load) * s;
  else if (t < 0.84) {
    toteX = x * s - 0.2 * Math.cos(angle);
    toteY = -0.2 * Math.sin(angle);
    toteZ = z;
    yaw = angle;
  } else toteX = mix(2.45, 3.58, unload) * s;
  const extension = eased(t, 0.2, 0.275) - load + unload - eased(t, 0.94, 0.97);
  return {
    x: x * s,
    angle,
    z,
    toteX,
    toteY,
    toteZ,
    yaw,
    extension,
    phase: phases.findIndex((p) => t < p.end),
  };
}
const palettes = {
  ivory: ["#e8e2cf", "#bfbda8", "#a4ac9d"],
  cream: ["#f5f1dd", "#d2d2be", "#a6ae9f"],
  orange: ["#ff935b", "#f06a32", "#bc451f"],
  steel: ["#adbfbb", "#82948e", "#657a71"],
  graphite: ["#3b4a43", "#27382f", "#192b23"],
  tire: ["#425047", "#223128", "#101d18"],
  tote: ["#a3c1c5", "#74959f", "#4e7581"],
  rib: ["#b6ced0", "#86a9af", "#66878c"],
  darkTote: ["#748a80", "#52675e", "#40574c"],
  cargo: ["#c6bda5", "#938a70", "#7b735e"],
  lamp: ["#bdedbf", "#80d7a2", "#599c75"],
  warn: ["#ffae75", "#fc8155", "#e95a32"],
};
export function paint(
  canvas,
  { t = 0, returned = false, fault = "normal", released = false, camera = 0 },
) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // clientWidth is the unscaled design size inside a Slidev canvas.
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!w || !h) return;
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const a = mix(0.22, 0.015, camera),
    elev = mix(0.51, 1.33, camera);
  const ca = Math.cos(a),
    sa = Math.sin(a),
    ce = Math.cos(elev),
    se = Math.sin(elev);
  const scale = Math.min(w / 9.8, h / (2.68 + camera * 0.82));
  const originY = h * (0.6 - camera * 0.075);
  const project = ([x, y, z]) => [
    w * 0.5 + (x * ca - y * sa) * scale,
    originY + ((x * sa + y * ca) * se - z * ce) * scale,
  ];
  const depth = ([x, y, z]) => (x * sa + y * ca) * ce + z * se;
  const faces = [];
  function path(pts, fill, stroke, width = 1) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = project(p);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    if (fill) {
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  const push = (pts, fill, edge = "rgba(6,19,15,.27)", bias = 0) =>
    faces.push({
      pts,
      fill,
      edge,
      sort: pts.reduce((v, p) => v + depth(p), 0) / pts.length + bias,
    });
  const tf = (x, y, z, yaw, dx, dy, dz) => [
    x + dx * Math.cos(yaw) - dy * Math.sin(yaw),
    y + dx * Math.sin(yaw) + dy * Math.cos(yaw),
    z + dz,
  ];
  function box(x, y, z, l, b, height, pal, yaw = 0) {
    const P = typeof pal === "string" ? palettes[pal] : pal;
    const pts = [];
    for (const uz of [0, height])
      for (const [ux, uy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        pts.push(tf(x, y, z, yaw, (ux * l) / 2, (uy * b) / 2, uz));
    const towardX = Math.sin(a + yaw) * ce,
      towardY = Math.cos(a + yaw) * ce;
    const face = (ids, color) =>
      push(
        ids.map((i) => pts[i]),
        color,
      );
    face([4, 5, 6, 7], P[0]);
    if (towardX > 0) face([1, 2, 6, 5], P[2]);
    else face([3, 0, 4, 7], P[2]);
    if (towardY > 0) face([2, 3, 7, 6], P[1]);
    else face([0, 1, 5, 4], P[1]);
  }
  function local(pose, dx, dy, dz, l, b, high, pal) {
    const pos = tf(pose.x, pose.y || 0, 0, pose.angle, dx, dy, dz);
    box(...pos, l, b, high, pal, pose.angle);
  }
  function wheel(pose, dx, dy, r) {
    const n = 14,
      center = tf(pose.x, 0, 0, pose.angle, dx, dy, 0.2);
    const pts = Array.from({ length: n }, (_, i) =>
      tf(
        ...center,
        pose.angle,
        r * Math.cos((i * 2 * Math.PI) / n),
        0,
        r * Math.sin((i * 2 * Math.PI) / n),
      ),
    );
    push(pts, "#1c2622", "#76867a", 0.02);
    push(
      Array.from({ length: n }, (_, i) =>
        tf(
          ...center,
          pose.angle,
          r * 0.45 * Math.cos((i * 2 * Math.PI) / n),
          0,
          r * 0.45 * Math.sin((i * 2 * Math.PI) / n),
        ),
      ),
      "#758276",
      "#4e5b50",
      0.025,
    );
  }
  function shadow(x, y, l, b) {
    const pts = Array.from({ length: 30 }, (_, i) => [
      x + (Math.cos((i * 2 * Math.PI) / 30) * l) / 2,
      y + (Math.sin((i * 2 * Math.PI) / 30) * b) / 2,
      0,
    ]);
    path(pts, "rgba(4,16,12,.29)");
  }
  function station(x, blocked) {
    shadow(x, 0.1, 1.93, 1.38);
    for (const dx of [-0.62, 0.62])
      for (const dy of [-0.39, 0.39])
        box(x + dx, dy, 0.03, 0.09, 0.09, 0.72, "steel");
    for (const dy of [-0.42, 0.42]) box(x, dy, 0.69, 1.55, 0.13, 0.13, "steel");
    for (let i = 0; i < 7; i++)
      box(x - 0.63 + 0.21 * i, 0, 0.73, 0.085, 0.84, 0.07, "graphite");
    box(x + Math.sign(x) * 0.69, 0, 0.79, 0.08, 0.97, 0.13, "steel");
    box(x + 0.28, 0.46, 0.66, 0.25, 0.07, 0.1, blocked ? "warn" : "lamp");
  }
  function tote(x, y, z, yaw, empty = false, blocked = false) {
    const p = { x, y, angle: yaw },
      mat = blocked ? "darkTote" : "tote";
    local(p, 0, 0, z, 1.14, 0.86, 0.055, "steel");
    local(p, 0, 0, z + 0.055, 1.05, 0.76, 0.075, mat);
    for (const sy of [-1, 1]) {
      local(p, 0, sy * 0.36, z + 0.1, 1.05, 0.065, 0.36, mat);
      local(
        p,
        0,
        sy * 0.37,
        z + 0.46,
        1.12,
        0.09,
        0.055,
        blocked ? "steel" : "rib",
      );
      for (const dx of [-0.36, 0, 0.36])
        local(
          p,
          dx,
          sy * 0.398,
          z + 0.115,
          0.032,
          0.026,
          0.32,
          blocked ? "steel" : "rib",
        );
    }
    for (const sx of [-1, 1])
      local(p, sx * 0.49, 0, z + 0.1, 0.075, 0.7, 0.37, mat);
    if (!empty && !blocked)
      for (const dx of [-0.22, 0.22])
        local(p, dx, 0, z + 0.12, 0.36, 0.55, 0.23, "cargo");
  }
  const v = hardware(t, returned),
    sign = returned ? -1 : 1;
  // The deck is an isometric drawing. Projection changes continuously when the camera toggles.
  path(
    [
      [-4.57, -1.16, 0],
      [4.57, -1.16, 0],
      [4.57, 1.16, 0],
      [-4.57, 1.16, 0],
    ],
    "#293a33",
    "#57685b",
    1,
  );
  for (let x = -4.5; x <= 4.5; x += 0.5)
    path(
      [
        [x, -1.14, 0],
        [x, 1.14, 0],
      ],
      null,
      "#3e5146",
      0.65,
    );
  for (let y = -1; y <= 1; y += 0.4)
    path(
      [
        [-4.55, y, 0],
        [4.55, y, 0],
      ],
      null,
      "#3e5146",
      0.65,
    );
  ctx.setLineDash([3, 5]);
  path(
    [
      [-3.55, 0, 0.01],
      [3.55, 0, 0.01],
    ],
    null,
    "#d59b68",
    1.4,
  );
  ctx.setLineDash([]);
  path(
    [
      [-3.55 * sign, 0, 0.012],
      [mix(-3.55, 3.55, clamp((t - 0.43) / 0.39)) * sign, 0, 0.012],
    ],
    null,
    "#ed8453",
    2,
  );
  shadow(v.x, 0.07, 1.7, 1.08);
  const occupied = fault === "occupied" && !released;
  station(-3.58, occupied && returned);
  station(3.58, occupied && !returned);
  if (occupied) tote(3.58 * sign, 0, 0.82, 0, true, true);
  local(v, 0, 0, 0.1, 1.5, 1.02, 0.17, "graphite");
  local(v, 0, 0, 0.25, 1.48, 1, 0.28, "ivory");
  for (const y of [-0.51, 0.51]) {
    wheel(v, 0.19, y, 0.184);
    wheel(v, -0.54, y * 0.94, 0.095);
  }
  local(v, 0.55, 0, 0.52, 0.24, 0.88, 1.14, "cream");
  for (const y of [-0.31, 0.31])
    local(v, 0.412, y, 0.56, 0.026, 0.058, 0.85, "steel");
  local(v, 0.414, 0, 1.48, 0.026, 0.3, 0.105, "graphite");
  local(v, -0.12, 0, v.z - 0.1, 1.2, 0.91, 0.1, "orange");
  local(
    v,
    -0.65 - v.extension * 0.53,
    0,
    v.z - 0.045,
    0.12 + v.extension * 1.1,
    0.31,
    0.028,
    "steel",
  );
  local(
    v,
    -0.7 - v.extension * 1.06,
    0,
    v.z - 0.025,
    0.055,
    0.3,
    0.07,
    "orange",
  );
  // The target and the box are independent objects. Wi-Fi acknowledgement cannot move either object.
  tote(v.toteX, v.toteY, v.toteZ, v.yaw, returned);
  faces.sort((u, v) => u.sort - v.sort);
  faces.forEach((f) =>
    path(f.pts, f.fill, f.edge, Math.max(0.45, scale * 0.006)),
  );
  if ((t > 0.025 && t < 0.19) || (t > 0.75 && t < 0.8)) {
    const target = (t < 0.2 ? -3.58 : 3.58) * sign;
    const src = tf(v.x, 0, 0, v.angle, 0.43, 0, 1.52);
    const wave = clamp((t * 37) % 1);
    const p1 = [target, -0.33 + wave * 0.12, 0.8],
      p2 = [target, 0.33 - wave * 0.12, 0.8];
    path([src, p1, p2], "rgba(255,169,103,.16)");
    path([p1, p2], null, "#ffad79", 1.8);
  }
  // Station names remain upright and legible in both camera positions.
  const small = w < 460;
  ctx.font = "600 " + (small ? 10 : 12) + 'px "Relay CJK",sans-serif';
  ctx.textAlign = "center";
  const names = returned
    ? ["备料站 · 回空口 R", "工位 A"]
    : ["备料站 · 出料口 P", "工位 A"];
  [-3.58, 3.58].forEach((x, i) => {
    const pt = project([x, 0.86, 0.015]);
    ctx.fillStyle = "#d7e4d4";
    ctx.fillText(names[i], pt[0], Math.min(h - 5, pt[1] + (small ? 11 : 16)));
  });
}
