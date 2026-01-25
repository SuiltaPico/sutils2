import { createSignal, onCleanup, onMount } from "solid-js";
import Phaser from "phaser";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const STAR_COUNT = 140;
const SHIP_MAX_HP = 120;
const MAGNET_RADIUS = 150;
const FRAGMENT_COLLECT_RADIUS = 18;
const BULLET_INTERVAL = 0.1;
const BULLET_SPEED = 560;
const BULLET_DAMAGE = 50;
const ASTEROID_SPAWN_MIN = 1.3;
const ASTEROID_SPAWN_MAX = 2.8;
const MIN_TRIANGLE_ANGLE_DEG = 30;

type Vec2 = { x: number; y: number };

interface HudState {
  hp: number;
  minerals: number;
  asteroidsCleared: number;
  fragments: number;
}

interface SceneBridge {
  updateHud: (hud: HudState) => void;
}

type BodyMetadataKind = "ship" | "bullet" | "asteroid-node" | "fragment";

type BodyMetadata = {
  kind: BodyMetadataKind;
  ref: unknown;
};

type BodyWithMetadata = MatterJS.BodyType & { gameData?: BodyMetadata };
type ConstraintWithMetadata = MatterJS.ConstraintType & { gameData?: BodyMetadata };

const Matter = (Phaser.Physics.Matter as any).Matter;

const COLLISION = {
  SHIP: 0x0001,
  BULLET: 0x0002,
  ASTEROID: 0x0004,
  FRAGMENT: 0x0008,
};

interface Bullet {
  body: Phaser.Physics.Matter.Image & Phaser.GameObjects.Rectangle;
  life: number;
}

interface AsteroidCollisionRef {
  asteroid: Asteroid;
  nodeIndex: number;
}

interface AsteroidSeed {
  center: Vec2;
  points?: Vec2[];
  drift?: number;
  palette?: { base: number; accent: number };
}

interface DelaunayTriangle {
  indices: [number, number, number];
  color: number;
  stroke: number;
}

type Triangle = [number, number, number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function vecLength(v: Vec2) {
  return Math.hypot(v.x, v.y);
}

function vecNormalize(v: Vec2) {
  const len = vecLength(v);
  if (!len) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function delaunayTriangulate(points: Vec2[]): Triangle[] {
  if (points.length < 3) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const delta = Math.max(dx, dy) * 10;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const superPts = [
    { x: midX - delta, y: midY - delta * 3 },
    { x: midX, y: midY + delta * 3 },
    { x: midX + delta, y: midY - delta * 3 },
  ];

  const allPoints = [...points, ...superPts];
  const superStartIndex = points.length;

  type Tri = { a: number; b: number; c: number; circle: { x: number; y: number; r2: number } };
  const triangles: Tri[] = [
    {
      a: superStartIndex,
      b: superStartIndex + 1,
      c: superStartIndex + 2,
      circle: circumcircle(superPts[0], superPts[1], superPts[2]),
    },
  ];

  for (let i = 0; i < points.length; i++) {
    const point = allPoints[i];
    const bad: Tri[] = [];
    for (const tri of triangles) {
      if (pointInCircle(point, tri.circle)) {
        bad.push(tri);
      }
    }

    const polygon: Array<[number, number]> = [];
    for (const tri of bad) {
      addEdge(polygon, tri.a, tri.b);
      addEdge(polygon, tri.b, tri.c);
      addEdge(polygon, tri.c, tri.a);
    }

    for (const tri of bad) {
      const idx = triangles.indexOf(tri);
      if (idx >= 0) triangles.splice(idx, 1);
    }

    for (const edge of polygon) {
      const triangle: Tri = {
        a: edge[0],
        b: edge[1],
        c: i,
        circle: circumcircle(allPoints[edge[0]], allPoints[edge[1]], point),
      };
      triangles.push(triangle);
    }
  }

  return triangles
    .filter((tri) => tri.a < superStartIndex && tri.b < superStartIndex && tri.c < superStartIndex)
    .map((tri) => [tri.a, tri.b, tri.c]);
}

function addEdge(polygon: Array<[number, number]>, a: number, b: number) {
  if (a > b) {
    const temp = a;
    a = b;
    b = temp;
  }
  for (let i = 0; i < polygon.length; i++) {
    const edge = polygon[i];
    if (edge[0] === a && edge[1] === b) {
      polygon.splice(i, 1);
      return;
    }
  }
  polygon.push([a, b]);
}

function circumcircle(p1: Vec2, p2: Vec2, p3: Vec2) {
  const d =
    2 *
    (p1.x * (p2.y - p3.y) +
      p2.x * (p3.y - p1.y) +
      p3.x * (p1.y - p2.y));

  if (Math.abs(d) < 1e-6) {
    return { x: 0, y: 0, r2: Number.POSITIVE_INFINITY };
  }

  const ux =
    ((p1.x ** 2 + p1.y ** 2) * (p2.y - p3.y) +
      (p2.x ** 2 + p2.y ** 2) * (p3.y - p1.y) +
      (p3.x ** 2 + p3.y ** 2) * (p1.y - p2.y)) /
    d;
  const uy =
    ((p1.x ** 2 + p1.y ** 2) * (p3.x - p2.x) +
      (p2.x ** 2 + p2.y ** 2) * (p1.x - p3.x) +
      (p3.x ** 2 + p3.y ** 2) * (p2.x - p1.x)) /
    d;
  const r2 = (ux - p1.x) ** 2 + (uy - p1.y) ** 2;
  return { x: ux, y: uy, r2 };
}

function pointInCircle(p: Vec2, circle: { x: number; y: number; r2: number }) {
  const dist2 = (p.x - circle.x) ** 2 + (p.y - circle.y) ** 2;
  return dist2 <= circle.r2;
}

function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function minTriangleAngleDeg(a: Vec2, b: Vec2, c: Vec2) {
  const ab = distance(a, b);
  const bc = distance(b, c);
  const ca = distance(c, a);
  if (ab < 1e-3 || bc < 1e-3 || ca < 1e-3) return 0;
  const angleA = Math.acos(clamp((ab ** 2 + ca ** 2 - bc ** 2) / (2 * ab * ca), -1, 1));
  const angleB = Math.acos(clamp((ab ** 2 + bc ** 2 - ca ** 2) / (2 * ab * bc), -1, 1));
  const angleC = Math.acos(clamp((bc ** 2 + ca ** 2 - ab ** 2) / (2 * bc * ca), -1, 1));
  const minRad = Math.min(angleA, angleB, angleC);
  return (minRad * 180) / Math.PI;
}

function triangleAngleInfo(a: Vec2, b: Vec2, c: Vec2) {
  const ab = distance(a, b);
  const bc = distance(b, c);
  const ca = distance(c, a);
  if (ab < 1e-3 || bc < 1e-3 || ca < 1e-3) {
    return { minAngle: 0, minIndex: 0 as 0 | 1 | 2 };
  }
  const angleA = Math.acos(clamp((ab ** 2 + ca ** 2 - bc ** 2) / (2 * ab * ca), -1, 1));
  const angleB = Math.acos(clamp((ab ** 2 + bc ** 2 - ca ** 2) / (2 * ab * bc), -1, 1));
  const angleC = Math.acos(clamp((bc ** 2 + ca ** 2 - ab ** 2) / (2 * bc * ca), -1, 1));
  const anglesRad = [angleA, angleB, angleC];
  let minIdx = 0;
  for (let i = 1; i < anglesRad.length; i++) {
    if (anglesRad[i] < anglesRad[minIdx]) minIdx = i;
  }
  const minAngle = (anglesRad[minIdx] * 180) / Math.PI;
  return { minAngle, minIndex: minIdx as 0 | 1 | 2 };
}

function relaxPointSetForMinAngle(
  points: Vec2[],
  center: Vec2,
  minAngleDeg: number,
  iterations = 6
) {
  const workingPoints = points.map((p) => ({ ...p }));
  const minRadius = 32;
  const maxRadius = 96;

  for (let iter = 0; iter < iterations; iter++) {
    const triangles = delaunayTriangulate(workingPoints);
    let changed = false;

    for (const tri of triangles) {
      const [ia, ib, ic] = tri as [number, number, number];
      const info = triangleAngleInfo(workingPoints[ia], workingPoints[ib], workingPoints[ic]);
      if (!isFinite(info.minAngle) || info.minAngle >= minAngleDeg) continue;

      changed = true;
      const indices = [ia, ib, ic];
      const vertexIdx = indices[info.minIndex];
      const vertex = workingPoints[vertexIdx];
      const other1 = workingPoints[indices[(info.minIndex + 1) % 3]];
      const other2 = workingPoints[indices[(info.minIndex + 2) % 3]];

      const mid = { x: (other1.x + other2.x) / 2, y: (other1.y + other2.y) / 2 };
      let dir = { x: vertex.x - mid.x, y: vertex.y - mid.y };
      const dirLen = vecLength(dir);
      if (dirLen < 1e-4) {
        dir = { x: vertex.x - center.x, y: vertex.y - center.y };
        const centerDirLen = vecLength(dir);
        if (centerDirLen < 1e-4) {
          const angle = Math.random() * Math.PI * 2;
          dir = { x: Math.cos(angle), y: Math.sin(angle) };
        } else {
          dir = { x: dir.x / centerDirLen, y: dir.y / centerDirLen };
        }
      } else {
        dir = { x: dir.x / dirLen, y: dir.y / dirLen };
      }

      const severity = clamp((minAngleDeg - info.minAngle) / minAngleDeg, 0, 1);
      const push = 3 + severity * 6;
      vertex.x += dir.x * push;
      vertex.y += dir.y * push;

      const rel = { x: vertex.x - center.x, y: vertex.y - center.y };
      const dist = vecLength(rel) || 1;
      const target = clamp(dist, minRadius, maxRadius);
      vertex.x = center.x + (rel.x / dist) * target;
      vertex.y = center.y + (rel.y / dist) * target;
    }

    if (!changed) break;
  }

  return workingPoints;
}

type FragmentUpdateState = "alive" | "collected" | "expired";

class MineralFragment {
  public collected = false;
  private ttl = 18;
  private swirl = Math.random() * Math.PI * 2;
  private vx: number;
  private vy: number;

  constructor(
    private scene: SpaceFlightScene,
    public readonly value: number,
    private readonly color: number,
    private arc: Phaser.GameObjects.Arc,
    initialVelocity: Vec2
  ) {
    this.vx = initialVelocity.x;
    this.vy = initialVelocity.y;
  }

  static spawn(
    scene: SpaceFlightScene,
    position: Vec2,
    value: number,
    color: number,
    initialVelocity: Vec2
  ) {
    const arc = scene.add.circle(position.x, position.y, 4, color, 0.95).setDepth(30);
    return new MineralFragment(scene, value, color, arc, initialVelocity);
  }

  nudge(direction: Vec2, strength: number) {
    const dir = vecNormalize(direction);
    this.vx += dir.x * strength;
    this.vy += dir.y * strength;
  }

  update(
    dt: number,
    ship: Phaser.Physics.Matter.Image,
    magnetRadius: number,
    collectRadius: number
  ): FragmentUpdateState {
    if (!this.arc.active) return "expired";
    this.ttl -= dt;
    this.swirl += dt * 0.8;

    const dx = ship.x - this.arc.x;
    const dy = ship.y - this.arc.y;
    const dist = Math.hypot(dx, dy);
    if (dist < magnetRadius && dist > 1) {
      const pull = (1 - dist / magnetRadius) * 90;
      this.vx += (dx / dist) * pull * dt;
      this.vy += (dy / dist) * pull * dt;
    }

    const wobble = Math.sin(this.swirl) * 0.3;
    this.arc.rotation = wobble;

    this.arc.x += this.vx * dt;
    this.arc.y += this.vy * dt;
    this.vx *= 0.995;
    this.vy *= 0.995;

    if (dist < collectRadius) {
      this.collect();
      return "collected";
    }

    if (this.ttl < 4) {
      const alpha = clamp(this.ttl / 4, 0, 1);
      this.arc.setAlpha(alpha);
    }

    if (this.collected || this.ttl <= 0 || this.outOfBounds()) {
      this.dispose();
      return "expired";
    }

    return "alive";
  }

  private outOfBounds() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    return (
      this.arc.x < -120 ||
      this.arc.x > w + 120 ||
      this.arc.y < -120 ||
      this.arc.y > h + 120
    );
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
  }

  dispose() {
    this.arc.destroy();
  }
}

type AsteroidNode = {
  body: MatterJS.BodyType;
  hp: number;
  maxHp: number;
  radius: number;
  destroyed: boolean;
};

type AsteroidEdge = {
  a: number;
  b: number;
  constraint: MatterJS.ConstraintType;
  strength: number;
  stress: number;
  broken: boolean;
};

let ASTEROID_SEQ = 0;

class Asteroid {
  public readonly id = ++ASTEROID_SEQ;
  private nodes: AsteroidNode[] = [];
  private edges: AsteroidEdge[] = [];
  private triangles: DelaunayTriangle[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private drift = randRange(60, 110);
  private aliveNodes = 0;
  private baseHue = Math.random() * 360;
  private edgeDecayTimer = 0;

  constructor(private scene: SpaceFlightScene, seed: AsteroidSeed) {
    const points = seed.points ?? this.randomPoints(seed.center);
    this.baseHue = Phaser.Math.Angle.WrapDegrees(randRange(15, 55) + Math.random() * 40);
    if (seed.palette) {
      this.baseHue = Phaser.Display.Color.GetColor32(
        (seed.palette.base >> 16) & 0xff,
        (seed.palette.base >> 8) & 0xff,
        seed.palette.base & 0xff,
        255
      );
    }
    this.drift = seed.drift ?? randRange(80, 150);
    this.graphics = this.scene.add.graphics().setDepth(8);
    this.build(points);
  }

  private randomPoints(center: Vec2) {
    const pts: Vec2[] = [];
    const outerCount = Phaser.Math.Between(7, 10);
    const innerCount = outerCount - 2;
    const outerRadius = randRange(60, 80);
    const innerRadius = outerRadius * randRange(0.45, 0.65);

    // 内圈
    for (let i = 0; i < innerCount; i++) {
      const angle =
        (i / innerCount) * Math.PI * 2 +
        randRange(-0.15, 0.15) +
        randRange(-0.2, 0.2);
      const r = innerRadius * randRange(0.9, 1.05);
      pts.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
    }

    // 外圈
    const angleOffset = randRange(0, Math.PI * 2);
    for (let i = 0; i < outerCount; i++) {
      const angle =
        angleOffset +
        (i / outerCount) * Math.PI * 2 +
        randRange(-0.12, 0.12);
      const r = outerRadius * randRange(0.94, 1.06);
      pts.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
    }

    // 轻微内缩，避免过于规整
    for (const p of pts) {
      const dir = { x: p.x - center.x, y: p.y - center.y };
      const d = vecLength(dir) || 1;
      const shrink = randRange(0.92, 0.98);
      p.x = center.x + (dir.x / d) * d * shrink;
      p.y = center.y + (dir.y / d) * d * shrink;
    }

    return relaxPointSetForMinAngle(pts, center, MIN_TRIANGLE_ANGLE_DEG, 6);
  }

  private build(points: Vec2[]) {
    const triangles = delaunayTriangulate(points);

    const palette = this.makePalette();

    triangles.forEach((indices) => {
      const [ia, ib, ic] = indices as [number, number, number];
      const minAngle = minTriangleAngleDeg(points[ia], points[ib], points[ic]);
      if (!isFinite(minAngle) || minAngle < MIN_TRIANGLE_ANGLE_DEG) return;
      const color = palette.fill[Math.floor(Math.random() * palette.fill.length)];
      const stroke = palette.stroke[Math.floor(Math.random() * palette.stroke.length)];
      this.triangles.push({ indices: [ia, ib, ic], color, stroke });
    });

    const colors = palette.core;
    points.forEach((pt, idx) => {
      const radius = randRange(10, 16);
      const body = Matter.Bodies.circle(pt.x, pt.y, radius, {
        frictionAir: 0.02,
        friction: 0.0001,
        restitution: 0.4,
        collisionFilter: {
          category: COLLISION.ASTEROID,
          mask: COLLISION.BULLET | COLLISION.SHIP,
        },
      });
      Matter.Body.setInertia(body, Infinity);
      const node: AsteroidNode = {
        body,
        hp: radius * 10,
        maxHp: radius * 10,
        radius,
        destroyed: false,
      };
      (body as BodyWithMetadata).gameData = {
        kind: "asteroid-node",
        ref: { asteroid: this, nodeIndex: idx },
      };
      this.scene.matter.world.add(body);
      this.nodes.push(node);
    });
    this.aliveNodes = this.nodes.length;

    const edgeSet = new Set<string>();
    for (const tri of triangles) {
      const combos: Array<[number, number]> = [
        [tri[0], tri[1]],
        [tri[1], tri[2]],
        [tri[2], tri[0]],
      ];
      for (const [a, b] of combos) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        const bodyA = this.nodes[a]?.body;
        const bodyB = this.nodes[b]?.body;
        if (!bodyA || !bodyB) continue;
        const len = Phaser.Math.Distance.Between(bodyA.position.x, bodyA.position.y, bodyB.position.x, bodyB.position.y);
        const constraint = Matter.Constraint.create({
          bodyA,
          bodyB,
          length: len,
          stiffness: 0.3,
          damping: 0.02,
        }) as ConstraintWithMetadata;
        constraint.gameData = { kind: "asteroid-node", ref: null };
        Matter.World.add(this.scene.matter.world.engine.world, constraint);
        this.edges.push({
          a,
          b,
          constraint,
          strength: len * randRange(7, 11),
          stress: 0,
          broken: false,
        });
      }
    }
  }

  private makePalette() {
    const baseHue = randRange(15, 35) / 360;
    const accentHue = clamp(baseHue + randRange(-0.08, 0.08), 0, 1);
    const fill = [
      Phaser.Display.Color.HSLToColor(baseHue, 0.55, 0.45).color,
      Phaser.Display.Color.HSLToColor(baseHue, 0.45, 0.35).color,
      Phaser.Display.Color.HSLToColor(accentHue, 0.5, 0.55).color,
    ];
    const stroke = [
      Phaser.Display.Color.HSLToColor(accentHue, 0.5, 0.7).color,
      Phaser.Display.Color.HSLToColor(baseHue, 0.4, 0.6).color,
    ];
    const core = [
      Phaser.Display.Color.HSLToColor(baseHue, 0.55, 0.45).color,
      Phaser.Display.Color.HSLToColor(accentHue, 0.5, 0.55).color,
    ];
    return { fill, stroke, core };
  }

  update(dt: number) {
    this.edgeDecayTimer += dt;
    const targetVel = -this.drift / 60;
    for (const node of this.nodes) {
      if (node.destroyed || !node.body) continue;
      const vx = node.body.velocity.x;
      Matter.Body.setVelocity(node.body, {
        x: Phaser.Math.Linear(vx, targetVel, 0.1),
        y: node.body.velocity.y * 0.995,
      });
    }
    if (this.edgeDecayTimer > 0.1) {
      this.edgeDecayTimer = 0;
      for (const edge of this.edges) {
        edge.stress *= 0.85;
        if (!edge.broken && edge.stress >= edge.strength) {
          this.breakEdge(edge);
        }
      }
    }
    this.render();
  }

  private render() {
    this.graphics.clear();
    for (const tri of this.triangles) {
      const pts = tri.indices
        .map((idx) => this.nodes[idx])
        .filter((node) => node && !node.destroyed && node.body) as AsteroidNode[];
      if (pts.length < 3) continue;
      this.graphics.fillStyle(tri.color, 0.95);
      this.graphics.beginPath();
      this.graphics.moveTo(pts[0].body.position.x, pts[0].body.position.y);
      this.graphics.lineTo(pts[1].body.position.x, pts[1].body.position.y);
      this.graphics.lineTo(pts[2].body.position.x, pts[2].body.position.y);
      this.graphics.closePath();
      this.graphics.fillPath();
      this.graphics.lineStyle(1, tri.stroke, 0.4);
      this.graphics.strokePath();
    }

    for (const edge of this.edges) {
      const nodeA = this.nodes[edge.a];
      const nodeB = this.nodes[edge.b];
      if (!nodeA || !nodeB || nodeA.destroyed || nodeB.destroyed) continue;
      const intensity = edge.broken ? 1 : clamp(edge.stress / edge.strength, 0, 1);
      if (intensity < 0.4) continue;
      this.graphics.lineStyle(edge.broken ? 4 : 2, 0xfbbf24, edge.broken ? 0.6 : 0.35 + intensity * 0.4);
      this.graphics.beginPath();
      this.graphics.moveTo(nodeA.body.position.x, nodeA.body.position.y);
      this.graphics.lineTo(nodeB.body.position.x, nodeB.body.position.y);
      this.graphics.strokePath();
    }
  }

  damageNode(index: number, direction: Vec2, amount: number) {
    const node = this.nodes[index];
    if (!node || node.destroyed) return;
    node.hp -= amount;
    const impulse = vecNormalize(direction);
    Matter.Body.applyForce(node.body, node.body.position, {
      x: impulse.x * amount * 0.0006,
      y: impulse.y * amount * 0.0006,
    });
    for (const edge of this.edges) {
      if (edge.broken) continue;
      if (edge.a === index || edge.b === index) {
        edge.stress += amount * randRange(0.5, 0.9);
        if (edge.stress >= edge.strength) {
          this.breakEdge(edge);
        }
      }
    }
    if (node.hp <= 0) {
      this.destroyNode(index);
    }
  }

  shipImpact(index: number, impulse: number) {
    const node = this.nodes[index];
    if (!node || node.destroyed) return;
    node.hp -= impulse * 0.6;
    if (node.hp <= 0) {
      this.destroyNode(index);
    }
  }

  private destroyNode(index: number) {
    const node = this.nodes[index];
    if (!node || node.destroyed) return;
    node.destroyed = true;
    this.aliveNodes -= 1;
    this.scene.spawnFragments(
      { x: node.body.position.x, y: node.body.position.y },
      { x: node.body.velocity.x, y: node.body.velocity.y },
      Phaser.Math.Between(2, 4),
      node.radius
    );
    Matter.World.remove(this.scene.matter.world.engine.world, node.body);
    for (const edge of this.edges) {
      if (edge.a === index || edge.b === index) {
        edge.broken = true;
      }
    }
  }

  private breakEdge(edge: AsteroidEdge) {
    edge.broken = true;
    Matter.World.remove(this.scene.matter.world.engine.world, edge.constraint);
  }

  isOffscreen() {
    return this.nodes.every((node) => !node.body || node.body.position.x < -200 || node.destroyed);
  }

  isDead() {
    return this.aliveNodes <= 0;
  }

  destroy() {
    this.graphics.destroy();
    for (const node of this.nodes) {
      if (node.body) {
        Matter.World.remove(this.scene.matter.world.engine.world, node.body);
      }
    }
    for (const edge of this.edges) {
      Matter.World.remove(this.scene.matter.world.engine.world, edge.constraint);
    }
  }
}

type Star = {
  rect: Phaser.GameObjects.Rectangle;
  speed: number;
  parallax: number;
};

class SpaceFlightScene extends Phaser.Scene {
  private ship!: Phaser.Physics.Matter.Image & Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private magnetGraphic!: Phaser.GameObjects.Graphics;
  private stars: Star[] = [];
  private bullets: Bullet[] = [];
  private asteroids: Asteroid[] = [];
  private fragments: MineralFragment[] = [];
  private fireCooldown = 0;
  private spawnTimer = randRange(ASTEROID_SPAWN_MIN, ASTEROID_SPAWN_MAX);
  private hud: HudState = { hp: SHIP_MAX_HP, minerals: 0, asteroidsCleared: 0, fragments: 0 };
  private hp = SHIP_MAX_HP;
  private minerals = 0;
  private hudTimer = 0;
  private shipHitCooldown = 0;

  constructor(private bridge: SceneBridge) {
    super("SpaceFlightScene");
  }

  create() {
    this.addBackground();
    this.createShip();
    this.magnetGraphic = this.add.graphics().setDepth(1);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    this.matter.world.on("collisionstart", this.handleCollision, this);
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    this.fireCooldown -= dt;
    this.spawnTimer -= dt;
    this.shipHitCooldown = Math.max(0, this.shipHitCooldown - dt);
    this.handleInput(dt);
    this.updateBullets(dt);
    this.updateAsteroids(dt);
    this.updateFragments(dt);
    this.updateStars(dt);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = randRange(ASTEROID_SPAWN_MIN, ASTEROID_SPAWN_MAX);
      this.spawnAsteroid();
    }
    this.drawMagnet();
    this.pushHud(dt);
  }

  private handleInput(dt: number) {
    const force = 0.0023;
    const up = this.cursors.up?.isDown || this.keys.W?.isDown;
    const down = this.cursors.down?.isDown || this.keys.S?.isDown;
    const left = this.cursors.left?.isDown || this.keys.A?.isDown;
    const right = this.cursors.right?.isDown || this.keys.D?.isDown;
    if (up) this.ship.applyForce(new Phaser.Math.Vector2(0, -force));
    if (down) this.ship.applyForce(new Phaser.Math.Vector2(0, force));
    if (left) this.ship.applyForce(new Phaser.Math.Vector2(-force, 0));
    if (right) this.ship.applyForce(new Phaser.Math.Vector2(force, 0));

    const shipBody = this.ship.body as MatterJS.BodyType | null;
    if (shipBody) {
      const speed = Math.hypot(shipBody.velocity.x, shipBody.velocity.y);
      if (speed > 7) {
        const damp = 7 / speed;
        Matter.Body.setVelocity(shipBody, {
          x: shipBody.velocity.x * damp,
          y: shipBody.velocity.y * damp,
        });
      }
    }

    const space = this.keys.SPACE;
    if (space?.isDown && this.fireCooldown <= 0) {
      this.fireCooldown = BULLET_INTERVAL;
      this.spawnBullet();
    }
  }

  private createShip() {
    const body = this.add
      .rectangle(180, GAME_HEIGHT / 2, 62, 24, 0x38bdf8, 0.9)
      .setStrokeStyle(2, 0x0ea5e9)
      .setDepth(5);
    this.ship = this.matter.add.gameObject(body, {
      chamfer: { radius: 8 },
      label: "ship",
    }) as Phaser.Physics.Matter.Image & Phaser.GameObjects.Rectangle;
    this.ship.setFixedRotation();
    this.ship.setFrictionAir(0.04);
    this.ship.setCollisionCategory(COLLISION.SHIP);
    this.ship.setCollidesWith(COLLISION.ASTEROID | COLLISION.FRAGMENT);
    const bodyMeta = this.ship.body as BodyWithMetadata;
    bodyMeta.gameData = { kind: "ship", ref: this };
  }

  private spawnBullet() {
    const rect = this.add.rectangle(this.ship.x + 40, this.ship.y, 14, 4, 0xffffff, 0.95).setDepth(20);
    const bullet = this.matter.add.gameObject(rect, {
      chamfer: { radius: 2 },
      label: "bullet",
    }) as Phaser.Physics.Matter.Image & Phaser.GameObjects.Rectangle;
    bullet.setIgnoreGravity(true);
    bullet.setFixedRotation();
    bullet.setCollisionCategory(COLLISION.BULLET);
    bullet.setCollidesWith(COLLISION.ASTEROID);
    bullet.setVelocity(BULLET_SPEED / 60, 0);
    bullet.setFrictionAir(0);
    const body = bullet.body as BodyWithMetadata;
    const bulletObj: Bullet = { body: bullet, life: 2.5 };
    body.gameData = { kind: "bullet", ref: bulletObj };
    this.bullets.push(bulletObj);
  }

  private updateBullets(dt: number) {
    this.bullets = this.bullets.filter((bullet) => {
      const sprite = bullet.body;
      if (!sprite.body) {
        return false;
      }
      bullet.life -= dt;
      if (bullet.life <= 0 || sprite.x > GAME_WIDTH + 50) {
        this.destroyBullet(bullet);
        return false;
      }
      return true;
    });
  }

  private destroyBullet(bullet: Bullet) {
    const sprite = bullet.body;
    const body = sprite.body as BodyWithMetadata | undefined;
    if (body?.gameData) body.gameData = undefined;
    if (!sprite.active) return;
    sprite.destroy();
  }

  private spawnAsteroid() {
    const center = { x: GAME_WIDTH + 120, y: randRange(80, GAME_HEIGHT - 80) };
    const asteroid = new Asteroid(this, { center });
    this.asteroids.push(asteroid);
  }

  private updateAsteroids(dt: number) {
    this.asteroids = this.asteroids.filter((asteroid) => {
      asteroid.update(dt);
      if (asteroid.isDead()) {
        this.hud.asteroidsCleared += 1;
        asteroid.destroy();
        return false;
      }
      if (asteroid.isOffscreen()) {
        asteroid.destroy();
        return false;
      }
      return true;
    });
  }

  spawnFragments(origin: Vec2, inheritVelocity: Vec2, count: number, scale: number) {
    for (let i = 0; i < count; i++) {
      const fragment = MineralFragment.spawn(
        this,
        { x: origin.x + randRange(-6, 6), y: origin.y + randRange(-6, 6) },
        Phaser.Math.Between(1, 3),
        0xfcd34d,
        {
          x: inheritVelocity.x + randRange(-20, -10) - scale * 0.02,
          y: inheritVelocity.y + randRange(-10, 10),
        }
      );
      const dir = { x: randRange(-1, 1), y: randRange(-1, 1) };
      fragment.nudge(dir, scale * 0.5 * randRange(0.2, 0.8));
      this.fragments.push(fragment);
    }
  }

  private updateFragments(dt: number) {
    this.fragments = this.fragments.filter((fragment) => {
      const state = fragment.update(dt, this.ship, MAGNET_RADIUS, FRAGMENT_COLLECT_RADIUS);
      if (state === "collected") {
        this.minerals += fragment.value;
        return false;
      }
      return state === "alive";
    });
  }

  private updateStars(dt: number) {
    for (const star of this.stars) {
      star.rect.x -= star.speed * star.parallax * dt;
      if (star.rect.x < -10) {
        star.rect.x = GAME_WIDTH + randRange(0, 60);
        star.rect.y = randRange(0, GAME_HEIGHT);
        star.speed = randRange(30, 90);
      }
    }
  }

  private addBackground() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020617).setDepth(-10);
    for (let i = 0; i < STAR_COUNT; i++) {
      const rect = this.add
        .rectangle(randRange(0, GAME_WIDTH), randRange(0, GAME_HEIGHT), 2, 2, 0xffffff)
        .setDepth(-5)
        .setAlpha(randRange(0.2, 0.9));
      rect.scale = randRange(0.3, 1.5);
      this.stars.push({
        rect,
        speed: randRange(20, 90),
        parallax: randRange(0.5, 1.4),
      });
    }
  }

  private drawMagnet() {
    this.magnetGraphic.clear();
    this.magnetGraphic.lineStyle(1, 0x38bdf8, 0.4);
    this.magnetGraphic.strokeCircle(this.ship.x, this.ship.y, MAGNET_RADIUS);
    this.magnetGraphic.fillStyle(0x38bdf8, 0.05);
    this.magnetGraphic.fillCircle(this.ship.x, this.ship.y, MAGNET_RADIUS);
  }

  private pushHud(dt: number) {
    this.hud.hp = Math.max(0, Math.round(this.hp));
    this.hud.minerals = this.minerals;
    this.hud.fragments = this.fragments.length;
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.bridge.updateHud({ ...this.hud });
    }
  }

  private handleCollision(event: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    for (const pair of event.pairs) {
      this.processPair(pair.bodyA as BodyWithMetadata, pair.bodyB as BodyWithMetadata, pair);
      this.processPair(pair.bodyB as BodyWithMetadata, pair.bodyA as BodyWithMetadata, pair);
    }
  }

  private processPair(
    bodyA: BodyWithMetadata,
    bodyB: BodyWithMetadata,
    pair: MatterJS.ICollisionPair
  ) {
    if (!bodyA?.gameData || !bodyB?.gameData) return;
    const metaA = bodyA.gameData;
    const metaB = bodyB.gameData;
    if (metaA.kind === "bullet" && metaB.kind === "asteroid-node") {
      const bullet = metaA.ref as Bullet;
      const ref = metaB.ref as AsteroidCollisionRef;
      const normal = new Phaser.Math.Vector2(pair.collision.normal.x, pair.collision.normal.y);
      if (pair.bodyA === bodyB) normal.negate();
      ref.asteroid.damageNode(ref.nodeIndex, normal, BULLET_DAMAGE);
      this.destroyBullet(bullet);
    } else if (metaA.kind === "ship" && metaB.kind === "asteroid-node") {
      if (this.shipHitCooldown > 0) return;
      const ref = metaB.ref as AsteroidCollisionRef;
      const shipBody = this.ship.body as MatterJS.BodyType | null;
      if (!shipBody) return;
      const relVx = (bodyB.velocity?.x ?? 0) - shipBody.velocity.x;
      const relVy = (bodyB.velocity?.y ?? 0) - shipBody.velocity.y;
      const relSpeed = Math.hypot(relVx, relVy);
      const damage = clamp(4 + relSpeed * 6, 4, 30);
      this.applyShipDamage(damage);
      ref.asteroid.shipImpact(ref.nodeIndex, damage);
      this.shipHitCooldown = 0.4;
    }
  }

  private applyShipDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    this.ship.setFillStyle(0x93c5fd);
    this.time.delayedCall(80, () => this.ship.setFillStyle(0x38bdf8));
  }
}

export default function SpaceFlightDemo() {
  const [hud, setHud] = createSignal<HudState>({
    hp: SHIP_MAX_HP,
    minerals: 0,
    asteroidsCleared: 0,
    fragments: 0,
  });

  let containerRef: HTMLDivElement | undefined;
  let game: Phaser.Game | null = null;

  onMount(() => {
    if (!containerRef || typeof window === "undefined") return;
    const bridge: SceneBridge = {
      updateHud: (next) => setHud(next),
    };
    const scene = new SpaceFlightScene(bridge);
    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#020617",
      parent: containerRef,
      physics: {
        default: "matter",
        matter: {
          gravity: { x: 0, y: 0 },
          enableSleeping: false,
        },
      },
      scene,
    });
  });

  onCleanup(() => {
    if (game) {
      game.destroy(true);
      game = null;
    }
  });

  return (
    <div class="space-y-3 p-4">
      <div>
        <h1 class="text-xl font-semibold">星际航行 · Phaser + Matter.js Demo</h1>
        <p class="text-sm text-zinc-400">
          WASD / 方向键 控制飞船 · 空格发射 · 自动吸磁收集矿物
        </p>
      </div>
      <div class="flex flex-wrap gap-3 text-sm">
        <Status label="船体" value={`${hud().hp} / ${SHIP_MAX_HP}`} />
        <Status label="矿物" value={hud().minerals.toString()} />
        <Status label="裂解陨石" value={hud().asteroidsCleared.toString()} />
        <Status label="漂浮碎片" value={hud().fragments.toString()} />
      </div>
      <div
        ref={(el) => (containerRef = el)}
        class="w-full max-w-[960px] border border-zinc-700 rounded bg-black overflow-hidden"
        style={{ "aspect-ratio": `${GAME_WIDTH} / ${GAME_HEIGHT}` }}
      />
    </div>
  );
}

function Status(props: { label: string; value: string }) {
  return (
    <div class="px-3 py-2 bg-zinc-900/70 border border-zinc-700 rounded text-zinc-100 min-w-[120px]">
      <div class="text-xs uppercase tracking-wide text-zinc-400">{props.label}</div>
      <div class="text-lg font-semibold">{props.value}</div>
    </div>
  );
}

