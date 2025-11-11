import { createSignal, onCleanup, onMount, Show } from "solid-js";

type Vec2 = { x: number; y: number };

type Enemy = {
  id: number;
  pos: Vec2; // tile-space continuous position
  hp: number;
  alive: boolean;
  reached: boolean;
};

// 固定网格与路径：单一路径（从左到右）
const GRID_W = 16;
const GRID_H = 10;
const TILE = 32; // 像素

// 路径选择：沿 y = 5 的直线
const PATH_Y = 5;
const SPAWN_X = 0;
const BASE_X = GRID_W - 1;

// 角色站位与朝向（面朝 +X）
const HERO_POS: Vec2 = { x: 6, y: PATH_Y };
const HERO_ATTACK_COOLDOWN_S = 0.3;
const HERO_DAMAGE_PER_TICK = 1;
// 面前 3x4：宽3（上下各 1 格），长4（向 +X）
const HERO_AOE_WIDTH = 3;
const HERO_AOE_LENGTH = 4;

// 敌人与经济
const ENEMY_TOTAL = 30;
const ENEMY_SPAWN_INTERVAL_S = 0.6;
const ENEMY_SPEED_TPS = 2 / 1; // 每秒 2 格
const ENEMY_HP = 3;

const FUEL_PER_SECOND = 1;

// 模拟步长（秒）
const FIXED_DT = 1 / 60;

export default function TowerDemo() {
  const [running, setRunning] = createSignal(true);
  const [fuel, setFuel] = createSignal(0);
  const [spawned, setSpawned] = createSignal(0);
  const [killed, setKilled] = createSignal(0);
  const [reached, setReached] = createSignal(0);
  const [enemies, setEnemies] = createSignal<Enemy[]>([]);
  const [timeSec, setTimeSec] = createSignal(0);

  let canvas: HTMLCanvasElement | undefined;
  let raf = 0;
  let acc = 0;
  let lastTs = 0;

  // 内部状态（无需触发刷新）
  let spawnTimer = 0;
  let fuelTimer = 0;
  let heroCooldown = 0;
  let enemySeq = 0;

  function reset() {
    setRunning(false);
    setFuel(0);
    setSpawned(0);
    setKilled(0);
    setReached(0);
    setEnemies([]);
    setTimeSec(0);
    spawnTimer = 0;
    fuelTimer = 0;
    heroCooldown = 0;
    enemySeq = 0;
  }

  function start() {
    setRunning(true);
  }

  function update(dt: number) {
    if (!running()) return;

    // 时间推进
    setTimeSec((t) => t + dt);

    // 燃素产出
    fuelTimer += dt;
    if (fuelTimer >= 1) {
      const ticks = Math.floor(fuelTimer * FUEL_PER_SECOND);
      if (ticks > 0) {
        setFuel((f) => f + ticks);
        fuelTimer -= ticks / FUEL_PER_SECOND;
      }
    }

    // 敌人生成
    if (spawned() < ENEMY_TOTAL) {
      spawnTimer += dt;
      if (spawnTimer >= ENEMY_SPAWN_INTERVAL_S) {
        spawnTimer -= ENEMY_SPAWN_INTERVAL_S;
        const y = PATH_Y;
        const e: Enemy = {
          id: ++enemySeq,
          pos: { x: SPAWN_X, y },
          hp: ENEMY_HP,
          alive: true,
          reached: false,
        };
        setEnemies((arr) => [...arr, e]);
        setSpawned((n) => n + 1);
      }
    }

    // 敌人移动
    setEnemies((arr) =>
      arr.map((e) => {
        if (!e.alive || e.reached) return e;
        const nx = e.pos.x + ENEMY_SPEED_TPS * dt;
        // 到达基地（进入 BASE_X 列右边界判定）
        if (nx >= BASE_X + 0.5) {
          e.reached = true;
          e.alive = false;
          setReached((r) => r + 1);
        } else {
          e.pos = { x: nx, y: e.pos.y };
        }
        return e;
      })
    );

    // 英雄激光（矩形 AOE，面朝 +X）
    heroCooldown -= dt;
    if (heroCooldown <= 0) {
      heroCooldown += HERO_ATTACK_COOLDOWN_S;
      const halfW = Math.floor(HERO_AOE_WIDTH / 2);
      const minY = HERO_POS.y - halfW;
      const maxY = HERO_POS.y + halfW;
      const minX = HERO_POS.x + 1;
      const maxX = HERO_POS.x + HERO_AOE_LENGTH;

      setEnemies((arr) =>
        arr.map((e) => {
          if (!e.alive) return e;
          const ex = e.pos.x;
          const ey = e.pos.y;
          const inRect = ex >= minX && ex <= maxX && ey >= minY && ey <= maxY;
          if (inRect) {
            e.hp -= HERO_DAMAGE_PER_TICK;
            if (e.hp <= 0) {
              e.alive = false;
              setKilled((k) => k + 1);
            }
          }
          return e;
        })
      );
    }
  }

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = GRID_W * TILE;
    const H = GRID_H * TILE;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    ctx.clearRect(0, 0, W, H);
    // 背景
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) {
      const px = x * TILE + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y++) {
      const py = y * TILE + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
      ctx.stroke();
    }

    // 路径（高亮 y=PATH_Y 行）
    ctx.fillStyle = "rgba(90,160,255,0.08)";
    ctx.fillRect(0, PATH_Y * TILE, W, TILE);

    // 基地（最右一格）
    ctx.fillStyle = "rgba(255,210,64,0.2)";
    ctx.fillRect(BASE_X * TILE, PATH_Y * TILE, TILE, TILE);
    ctx.strokeStyle = "rgba(255,210,64,0.8)";
    ctx.strokeRect(BASE_X * TILE + 0.5, PATH_Y * TILE + 0.5, TILE - 1, TILE - 1);

    // 英雄
    drawHero(ctx);
    // 英雄 AOE 可视化
    drawHeroAoe(ctx);

    // 敌人
    enemies().forEach((e) => {
      if (!e.alive) return;
      drawEnemy(ctx, e);
    });
  }

  function drawHero(ctx: CanvasRenderingContext2D) {
    const x = HERO_POS.x * TILE + TILE * 0.5;
    const y = HERO_POS.y * TILE + TILE * 0.5;
    ctx.save();
    ctx.translate(x, y);
    // 身体
    ctx.fillStyle = "#67e8f9";
    ctx.beginPath();
    ctx.arc(0, 0, TILE * 0.35, 0, Math.PI * 2);
    ctx.fill();
    // 朝向箭头（右）
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(8, -4);
    ctx.lineTo(10, 0);
    ctx.lineTo(8, 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawHeroAoe(ctx: CanvasRenderingContext2D) {
    const halfW = Math.floor(HERO_AOE_WIDTH / 2);
    const minY = (HERO_POS.y - halfW) * TILE;
    const maxY = (HERO_POS.y + halfW + 1) * TILE;
    const minX = (HERO_POS.x + 1) * TILE;
    const maxX = (HERO_POS.x + HERO_AOE_LENGTH + 1) * TILE;
    ctx.save();
    ctx.fillStyle = "rgba(34,211,238,0.12)";
    ctx.strokeStyle = "rgba(34,211,238,0.5)";
    ctx.lineWidth = 1;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.strokeRect(minX + 0.5, minY + 0.5, maxX - minX - 1, maxY - minY - 1);
    ctx.restore();
  }

  function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    // 敌人绘制在 tile 内置中
    const px = e.pos.x * TILE + TILE * 0.5;
    const py = e.pos.y * TILE + TILE * 0.5;
    ctx.save();
    // 身体
    ctx.fillStyle = "#f87171";
    ctx.beginPath();
    ctx.arc(px, py, TILE * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // 血条
    const barW = TILE * 0.7;
    const barH = 4;
    const hpRatio = Math.max(0, e.hp / ENEMY_HP);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(px - barW / 2, py - TILE * 0.38, barW, barH);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(px - barW / 2, py - TILE * 0.38, barW * hpRatio, barH);
    ctx.restore();
  }

  function loop(ts: number) {
    if (!lastTs) lastTs = ts;
    let dtMs = ts - lastTs;
    // 限制切到后台时的巨帧
    if (dtMs > 100) dtMs = 100;
    lastTs = ts;
    acc += dtMs / 1000;
    while (acc >= FIXED_DT) {
      update(FIXED_DT);
      acc -= FIXED_DT;
    }
    render();
    raf = requestAnimationFrame(loop);
  }

  onMount(() => {
    raf = requestAnimationFrame(loop);
  });

  onCleanup(() => {
    if (raf) cancelAnimationFrame(raf);
  });

  const remaining = () =>
    ENEMY_TOTAL - killed() - reached() - enemies().filter((e) => e.alive).length;

  return (
    <div class="p-4 space-y-3">
      <h1 class="text-xl font-semibold">塔防 Demo（单路·激光AOE）</h1>
      <div class="flex flex-wrap items-center gap-3">
        <button
          class="border px-3 py-1"
          onClick={() => (running() ? setRunning(false) : setRunning(true))}
        >
          {running() ? "暂停" : "继续"}
        </button>
        <button
          class="border px-3 py-1"
          onClick={() => {
            reset();
            start();
          }}
        >
          重置并开始
        </button>
        <div class="px-2 py-1 rounded bg-zinc-800 text-zinc-100">
          燃素：{fuel()}
        </div>
        <div class="px-2 py-1 rounded bg-zinc-800 text-zinc-100">
          已生成：{spawned()} / {ENEMY_TOTAL}
        </div>
        <div class="px-2 py-1 rounded bg-zinc-800 text-zinc-100">
          存活：{enemies().filter((e) => e.alive).length}
        </div>
        <div class="px-2 py-1 rounded bg-zinc-800 text-zinc-100">
          击杀：{killed()}
        </div>
        <div class="px-2 py-1 rounded bg-zinc-800 text-zinc-100">
          入侵：{reached()}
        </div>
        <div class="px-2 py-1 rounded bg-zinc-800 text-zinc-100">
          未出场：{remaining()}
        </div>
        <div class="px-2 py-1 text-zinc-400">
          用时：{timeSec().toFixed(1)}s
        </div>
      </div>
      <div class="inline-block border">
        <canvas ref={canvas!} style={{ width: `${GRID_W * TILE}px`, height: `${GRID_H * TILE}px` }} />
      </div>
      <Show when={killed() + reached() >= ENEMY_TOTAL}>
        <div class="text-sm text-zinc-300">
          所有敌人已处理完毕：击杀 {killed()}，入侵 {reached()}。
        </div>
      </Show>
    </div>
  );
}

