// gta6-meme-x-01 — "WANTED LEVEL: 6 STARS"
// Generates meme.png (1024x1024) procedurally and copies POST.json to the
// output directory. Pure Node standard library only, fully deterministic:
// no network, no clock, no randomness — every run produces identical bytes.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- colors
type RGB = [number, number, number];
const NAVY: RGB = [14, 11, 38];
const MAGENTA: RGB = [194, 24, 123];
const PINK: RGB = [255, 92, 168];
const INK: RGB = [26, 20, 32];
const WHITE: RGB = [255, 255, 255];
const CYAN: RGB = [55, 230, 230];
const YELLOW: RGB = [255, 210, 63];
const GROUND: RGB = [10, 7, 20];
const BUILDING: RGB = [22, 16, 44];
const PURPLE_MID: RGB = [42, 17, 80];
const HORIZON: RGB = [138, 30, 107];

// ---------------------------------------------------------------- canvas
const buf = new Uint8Array(W * H * 4);

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = 255;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(x, y, c);
    }
  }
}

// Even-odd scanline fill for an arbitrary polygon.
function fillPolygon(pts: Array<[number, number]>, c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c);
    }
  }
}

// 5-pointed star, outer radius ro, inner radius ri.
function starPoints(cx: number, cy: number, ro: number, ri: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function drawStar(cx: number, cy: number, ro: number, ri: number, c: RGB): void {
  fillPolygon(starPoints(cx, cy, ro, ri), c);
}

// 4-point sparkle (diamond star), used for the ghost's eyes.
function drawSparkle(cx: number, cy: number, r: number, c: RGB): void {
  const k = 0.28;
  fillPolygon(
    [
      [cx, cy - r],
      [cx + r * k, cy - r * k],
      [cx + r, cy],
      [cx + r * k, cy + r * k],
      [cx, cy + r],
      [cx - r * k, cy + r * k],
      [cx - r, cy],
      [cx - r * k, cy - r * k],
    ],
    c,
  );
}

// Thick line drawn as a chain of discs (deterministic).
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// ------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows of 5 characters, "#" = ink, "." = empty.
// Designed from scratch for this meme.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "00100", "00000", "00000", "00000", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
};

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - scale;
}

function drawTextAt(text: string, x: number, y: number, scale: number, c: RGB): void {
  const upper = text.toUpperCase();
  for (let ci = 0; ci < upper.length; ci++) {
    const g = GLYPHS[upper[ci]] || GLYPHS[" "];
    const gx = x + ci * 6 * scale;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          fillRect(gx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
  }
}

// Centered text with a thick black outline (outline pass first, then face).
function drawTextCentered(text: string, cx: number, y: number, scale: number, face: RGB, outline: RGB): void {
  const w = textWidth(text, scale);
  const x = Math.round(cx - w / 2);
  const o = scale;
  const offsets: Array<[number, number]> = [
    [-o, 0], [o, 0], [0, -o], [0, o],
    [-o, -o], [o, -o], [-o, o], [o, o],
  ];
  for (const [dx, dy] of offsets) drawTextAt(text, x + dx, y + dy, scale, outline);
  drawTextAt(text, x, y, scale, face);
}

// ------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ scene
// Fixed star field in the night sky: [x, y, size].
const SKY_STARS: Array<[number, number, number]> = [
  [60, 210, 3], [140, 160, 2], [220, 230, 3], [300, 150, 2], [380, 200, 3],
  [460, 140, 2], [560, 180, 3], [640, 130, 2], [720, 200, 3], [800, 150, 2],
  [880, 220, 3], [950, 170, 2], [100, 300, 2], [180, 340, 3], [260, 310, 2],
  [760, 330, 2], [840, 300, 3], [920, 340, 2], [40, 420, 2], [980, 430, 2],
  [340, 330, 2], [620, 340, 2], [500, 110, 2], [60, 90, 2], [970, 90, 3],
  [420, 90, 2], [700, 90, 2], [150, 480, 2], [880, 480, 2], [520, 330, 2],
];

// Skyline: [x, width, topY]. Windows are a fixed grid, lit by a fixed rule.
const BUILDINGS: Array<[number, number, number]> = [
  [16, 92, 690], [118, 72, 640], [200, 112, 700], [322, 82, 620],
  [414, 96, 680], [560, 84, 700], [700, 92, 660], [802, 72, 710],
  [884, 116, 640],
];

function drawSky(): void {
  for (let y = 0; y < 860; y++) {
    const t = y / 860;
    let c: RGB;
    if (t < 0.55) c = mix(NAVY, PURPLE_MID, t / 0.55);
    else if (t < 0.8) c = mix(PURPLE_MID, HORIZON, (t - 0.55) / 0.25);
    else c = mix(HORIZON, MAGENTA, (t - 0.8) / 0.2);
    fillRect(0, y, W, 1, c);
  }
  fillRect(0, 860, W, 80, GROUND);
  for (const [x, y, s] of SKY_STARS) {
    fillRect(x, y, s, s, WHITE);
  }
}

function drawSkyline(): void {
  // Dark band behind the whole skyline row so the buildings lift off the
  // bright magenta horizon instead of sinking into it.
  fillRect(0, 588, W, 272, [12, 8, 28]);
  BUILDINGS.forEach(([bx, bw, top], bi) => {
    fillRect(bx, top, bw, 860 - top, BUILDING);
    // Neon roofline: a thin bright edge along the top of each building.
    fillRect(bx, top, bw, 3, bi % 2 === 0 ? CYAN : PINK);
    // Neon windows on a fixed grid. The two outermost buildings sit
    // against the brightest part of the horizon, so they get bigger,
    // brighter windows with almost no dark ones.
    const edge = bi === 0 || bi === BUILDINGS.length - 1;
    const ww = edge ? 10 : 8;
    const wh = edge ? 12 : 10;
    const cols = Math.floor((bw - 16) / 18);
    const rows = Math.floor((860 - top - 16) / 22);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const darkMod = edge ? 8 : 4;
        if ((col * 7 + r * 3 + bi * 5) % darkMod === 0) continue; // dark window
        const wc = (col + r) % 3 === 0 ? PINK : (col + r) % 3 === 1 ? CYAN : YELLOW;
        fillRect(bx + 8 + col * 18, top + 10 + r * 22, ww, wh, wc);
      }
    }
  });
}

// One palm frond: a tapered ribbon swept along a quadratic Bezier from the
// crown to the tip. The control point sags downward (droop), so the frond
// arches and bends like a real palm leaf instead of a straight spike.
function drawFrond(cx: number, cy: number, tipX: number, tipY: number, droop: number, w: number, c: RGB): void {
  const ctrlX = (cx + tipX) / 2;
  const ctrlY = (cy + tipY) / 2 + droop;
  const steps = 14;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * cx + 2 * mt * t * ctrlX + t * t * tipX;
    const y = mt * mt * cy + 2 * mt * t * ctrlY + t * t * tipY;
    const dx = 2 * mt * (ctrlX - cx) + 2 * t * (tipX - ctrlX);
    const dy = 2 * mt * (ctrlY - cy) + 2 * t * (tipY - ctrlY);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const half = (w / 2) * (1 - t * 0.92);
    left.push([x + nx * half, y + ny * half]);
    right.push([x - nx * half, y - ny * half]);
  }
  fillPolygon([...left, ...right.reverse()], c);
}

function drawPalm(baseX: number, baseY: number, crownX: number, crownY: number, lean: number): void {
  // Trunk with a slight bend: two thick segments instead of one straight line.
  const midX = (baseX + crownX) / 2 + lean * 0.4;
  const midY = (baseY + crownY) / 2;
  thickLine(baseX, baseY, midX, midY, 13, INK);
  thickLine(midX, midY, crownX, crownY, 13, INK);
  // Six fronds fanning out from the crown, each arcing and drooping.
  // [dx, dy, droop]: droop sags the Bezier control point downward.
  // Broad blades (w 24) with a gentle sag: thin ribbons read as spider legs.
  const fronds: Array<[number, number, number]> = [
    [-92, -5, 16], [-74, -56, 24], [-28, -80, 28],
    [26, -76, 28], [68, -50, 22], [90, 2, 14],
  ];
  for (const [dx, dy, droop] of fronds) {
    drawFrond(crownX, crownY, crownX + dx + lean, crownY + dy, droop, 24, INK);
  }
  // Coconuts tucked under the crown.
  fillCircle(crownX - 9, crownY + 15, 7, INK);
  fillCircle(crownX + 9, crownY + 15, 7, INK);
  fillCircle(crownX, crownY + 21, 7, INK);
  fillCircle(crownX, crownY, 12, INK);
}

function drawGhost(): void {
  // Magenta backdrop disc with a black ring.
  fillCircle(512, 600, 248, INK);
  fillCircle(512, 600, 235, MAGENTA);
  fillCircle(512, 600, 200, [168, 20, 105]);

  // Ghost body: black outline shape first, then the white body on top.
  // Outline: dome + slab + three bottom bumps.
  fillCircle(512, 545, 168, INK);
  fillRect(344, 545, 336, 220, INK);
  for (const bx of [412, 512, 612]) fillCircle(bx, 756, 56, INK);
  // White body, slightly smaller and shifted up.
  fillCircle(512, 545, 150, WHITE);
  fillRect(362, 545, 300, 208, WHITE);
  for (const bx of [412, 512, 612]) fillCircle(bx, 750, 48, WHITE);

  // Left arm bump.
  fillCircle(366, 640, 26, INK);
  fillCircle(366, 640, 20, WHITE);

  // Sparkle eyes (black 4-point stars).
  drawSparkle(462, 560, 30, INK);
  drawSparkle(562, 560, 30, INK);

  // Right hand holding the star coin up.
  fillCircle(648, 545, 30, INK);
  fillCircle(648, 545, 24, WHITE);
  // Star coin: black outline, bright pink ring, magenta disc, white star.
  // The pink ring keeps the coin from melting into the magenta disc behind it.
  fillCircle(712, 452, 74, INK);
  fillCircle(712, 452, 68, PINK);
  fillCircle(712, 452, 58, MAGENTA);
  drawStar(712, 452, 42, 17, WHITE);
}

function drawWantedStars(): void {
  const xs = [287, 377, 467, 557, 647, 737];
  const y = 258;
  for (let i = 0; i < 5; i++) {
    drawStar(xs[i], y, 40, 16, INK);
    drawStar(xs[i], y, 34, 14, WHITE);
  }
  // Sixth star: the big glowing magenta one, above the ghost's coin.
  fillCircle(xs[5], y, 58, PINK);
  drawStar(xs[5], y, 54, 22, INK);
  drawStar(xs[5], y, 46, 19, MAGENTA);
}

function buildMeme(): Buffer {
  drawSky();
  drawSkyline();
  drawPalm(95, 860, 80, 600, -14);
  drawPalm(935, 860, 950, 610, 14);
  drawWantedStars();
  drawGhost();

  // Top text.
  drawTextCentered("WAITED 13 YEARS", 512, 34, 8, WHITE, INK);
  drawTextCentered("FOR GTA 6", 512, 112, 8, WHITE, INK);
  // Bottom text, just above the magenta strip.
  drawTextCentered("WANTED LEVEL: 6 STARS", 512, 878, 7, WHITE, INK);

  // Magenta strip with the make.fun name.
  fillRect(0, 940, W, 84, MAGENTA);
  drawTextCentered("make.fun", 512, 950, 5, WHITE, INK);
  drawTextCentered("AI AGENTS EARN REAL MONEY", 512, 992, 3, WHITE, INK);

  return encodePng();
}

// ------------------------------------------------------------------- main
function main(): void {
  const botDir = path.resolve(process.env.MAKEFUN_BOT_DIR || process.cwd());
  const outEnv = process.env.MAKEFUN_OUTPUT_DIR;
  const outDir = outEnv ? path.resolve(outEnv) : path.join(botDir, "out");
  fs.mkdirSync(outDir, { recursive: true });

  let post: Buffer;
  try {
    post = fs.readFileSync(path.join(botDir, "POST.json"));
  } catch {
    process.stderr.write("POST.json not found or unreadable in " + botDir + "\n");
    process.exit(1);
  }

  const png = buildMeme();
  fs.writeFileSync(path.join(outDir, "meme.png"), png);
  fs.writeFileSync(path.join(outDir, "POST.json"), post);

  // Also keep a copy at the repo root when the output dir is elsewhere.
  // Best effort only: in the grader sandbox the repo is read-only, and the
  // outputs above are what matter — a failed root copy must not fail the run.
  const rootPng = path.join(botDir, "meme.png");
  if (path.resolve(rootPng) !== path.resolve(path.join(outDir, "meme.png"))) {
    try {
      fs.writeFileSync(rootPng, png);
    } catch {
      // ignore: repo read-only in sandbox
    }
  }
}

main();
