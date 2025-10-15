import { createSignal, onCleanup, onMount } from "solid-js";

export default function ChaoticPendulum() {
  const [width, setWidth] = createSignal(640);
  const [height, setHeight] = createSignal(480);
  const [l1, setL1] = createSignal(1.0); // 长度（相对单位）
  const [l2, setL2] = createSignal(1.0);
  const [m1, setM1] = createSignal(1.0); // 质量（相对单位）
  const [m2, setM2] = createSignal(1.0);
  const [g, setG] = createSignal(9.81);
  const [damping, setDamping] = createSignal(0.0005); // 简单线性阻尼
  const [dt, setDt] = createSignal(1 / 120); // 积分步长（秒）

  // 角度与角速度（弧度）
  const [theta1, setTheta1] = createSignal(Math.PI * 0.5);
  const [theta2, setTheta2] = createSignal(Math.PI * 0.9);
  const [omega1, setOmega1] = createSignal(0);
  const [omega2, setOmega2] = createSignal(0);
  const [trail, setTrail] = createSignal(true);
  const [integrator, setIntegrator] = createSignal<"rk4" | "euler">("rk4");
  const [substeps, setSubsteps] = createSignal(1);

  let canvas: HTMLCanvasElement | undefined;
  let raf = 0;

  function computeAccelerations(
    t1: number,
    t2: number,
    w1: number,
    w2: number,
    L1: number,
    L2: number,
    M1: number,
    M2: number,
    GG: number
  ) {
    const d = t1 - t2;
    const den = 2 * M1 + M2 - M2 * Math.cos(2 * t1 - 2 * t2);
    const a1 =
      (-GG * (2 * M1 + M2) * Math.sin(t1)
        - M2 * GG * Math.sin(t1 - 2 * t2)
        - 2 * Math.sin(d) * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) /
      (L1 * den);
    const a2 =
      (2 * Math.sin(d) *
        (w1 * w1 * L1 * (M1 + M2) + GG * (M1 + M2) * Math.cos(t1) + M2 * w2 * w2 * L2 * Math.cos(d))) /
      (L2 * den);
    return { a1, a2 };
  }

  function deriv(state: [number, number, number, number]) {
    const [t1, t2, w1, w2] = state;
    const L1 = Math.max(0.1, l1());
    const L2 = Math.max(0.1, l2());
    const M1 = Math.max(0.001, m1());
    const M2 = Math.max(0.001, m2());
    const GG = g();
    const { a1, a2 } = computeAccelerations(t1, t2, w1, w2, L1, L2, M1, M2, GG);
    // 在线性阻尼下：dw/dt 额外减去 damping * w
    const c = Math.max(0, damping());
    return [w1, w2, a1 - c * w1, a2 - c * w2] as const;
  }

  function stepEulerOnce(h: number) {
    const s0: [number, number, number, number] = [
      theta1(),
      theta2(),
      omega1(),
      omega2(),
    ];
    const k1 = deriv(s0);
    const s1: [number, number, number, number] = [
      s0[0] + k1[0] * h,
      s0[1] + k1[1] * h,
      s0[2] + k1[2] * h,
      s0[3] + k1[3] * h,
    ];
    setTheta1(s1[0]);
    setTheta2(s1[1]);
    setOmega1(s1[2]);
    setOmega2(s1[3]);
  }

  function stepRK4Once(h: number) {
    const s0: [number, number, number, number] = [
      theta1(),
      theta2(),
      omega1(),
      omega2(),
    ];
    const k1 = deriv(s0);
    const s_k2: [number, number, number, number] = [
      s0[0] + (k1[0] * h) / 2,
      s0[1] + (k1[1] * h) / 2,
      s0[2] + (k1[2] * h) / 2,
      s0[3] + (k1[3] * h) / 2,
    ];
    const k2 = deriv(s_k2);
    const s_k3: [number, number, number, number] = [
      s0[0] + (k2[0] * h) / 2,
      s0[1] + (k2[1] * h) / 2,
      s0[2] + (k2[2] * h) / 2,
      s0[3] + (k2[3] * h) / 2,
    ];
    const k3 = deriv(s_k3);
    const s_k4: [number, number, number, number] = [
      s0[0] + k3[0] * h,
      s0[1] + k3[1] * h,
      s0[2] + k3[2] * h,
      s0[3] + k3[3] * h,
    ];
    const k4 = deriv(s_k4);
    const t1Next = s0[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const t2Next = s0[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    const w1Next = s0[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    const w2Next = s0[3] + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
    setTheta1(t1Next);
    setTheta2(t2Next);
    setOmega1(w1Next);
    setOmega2(w2Next);
  }

  function stepPhysics(n = 1) {
    const h = dt() / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      if (integrator() === "rk4") stepRK4Once(h);
      else stepEulerOnce(h);
    }
  }

  function drawFrame(ctx: CanvasRenderingContext2D) {
    const W = Math.max(100, width());
    const H = Math.max(100, height());
    if (canvas && (canvas.width !== W || canvas.height !== H)) {
      canvas.width = W;
      canvas.height = H;
    }

    // 渐隐拖影
    if (trail()) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }

    const pivotX = Math.floor(W / 2);
    const pivotY = Math.floor(H * 0.2);
    const scale = Math.min(W, H) * 0.25; // 像素缩放

    const L1p = l1() * scale;
    const L2p = l2() * scale;

    const t1 = theta1();
    const t2 = theta2();

    const x1 = pivotX + L1p * Math.sin(t1);
    const y1 = pivotY + L1p * Math.cos(t1);
    const x2 = x1 + L2p * Math.sin(t2);
    const y2 = y1 + L2p * Math.cos(t2);

    // 臂
    ctx.strokeStyle = "#0f172a"; // slate-900
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivotX + 0.5, pivotY + 0.5);
    ctx.lineTo(x1 + 0.5, y1 + 0.5);
    ctx.lineTo(x2 + 0.5, y2 + 0.5);
    ctx.stroke();

    // 轴与摆锤
    ctx.fillStyle = "#334155"; // slate-600
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0ea5e9"; // sky-500
    ctx.beginPath();
    ctx.arc(x1, y1, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ef4444"; // red-500
    ctx.beginPath();
    ctx.arc(x2, y2, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    // 根据用户设定的子步执行积分
    stepPhysics(Math.max(1, substeps()))
    drawFrame(ctx);
    raf = requestAnimationFrame(loop);
  }

  function resetRandom() {
    setTheta1(Math.PI * (0.4 + Math.random() * 0.2));
    setTheta2(Math.PI * (0.7 + Math.random() * 0.6));
    setOmega1(0);
    setOmega2(0);
  }

  onMount(() => {
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width(), height());
    }
    raf = requestAnimationFrame(loop);
  });
  onCleanup(() => cancelAnimationFrame(raf));

  return (
    <div class="p-4 space-y-4">
      <h1 class="text-xl font-semibold">混沌摆（双摆）</h1>
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col w-28">
          <span>宽度</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={width()}
            onInput={(e) => setWidth(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col">
          <span>积分器</span>
          <select
            class="border px-2 py-1"
            value={integrator()}
            onInput={(e) => setIntegrator(e.currentTarget.value as any)}
          >
            <option value="rk4">RK4（推荐）</option>
            <option value="euler">Euler</option>
          </select>
        </label>
        <label class="flex flex-col w-28">
          <span>子步数</span>
          <input
            type="number"
            class="border px-2 py-1"
            min="1"
            value={substeps()}
            onInput={(e) => setSubsteps(Math.max(1, e.currentTarget.valueAsNumber || 1))}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>高度</span>
          <input
            type="number"
            class="border px-2 py-1"
            value={height()}
            onInput={(e) => setHeight(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>L1</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={l1()}
            onInput={(e) => setL1(e.currentTarget.valueAsNumber || 0.5)}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>L2</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={l2()}
            onInput={(e) => setL2(e.currentTarget.valueAsNumber || 0.5)}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>M1</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={m1()}
            onInput={(e) => setM1(e.currentTarget.valueAsNumber || 1)}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>M2</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={m2()}
            onInput={(e) => setM2(e.currentTarget.valueAsNumber || 1)}
          />
        </label>
        <label class="flex flex-col w-28">
          <span>g</span>
          <input
            step="0.01"
            type="number"
            class="border px-2 py-1"
            value={g()}
            onInput={(e) => setG(e.currentTarget.valueAsNumber || 9.81)}
          />
        </label>
        <label class="flex flex-col w-32">
          <span>阻尼</span>
          <input
            step="0.0001"
            type="number"
            class="border px-2 py-1"
            value={damping()}
            onInput={(e) => setDamping(e.currentTarget.valueAsNumber || 0)}
          />
        </label>
        <label class="flex flex-col w-32">
          <span>dt(秒)</span>
          <input
            step="0.0001"
            type="number"
            class="border px-2 py-1"
            value={dt()}
            onInput={(e) => setDt(e.currentTarget.valueAsNumber || 0.008)}
          />
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={trail()}
            onInput={(e) => setTrail(e.currentTarget.checked)}
          />
          拖影
        </label>
        <button class="border px-3 py-1" onClick={resetRandom}>随机初始状态</button>
        <button
          class="border px-3 py-1"
          onClick={() => {
            setTheta1(Math.PI * 0.5);
            setTheta2(Math.PI * 0.9);
            setOmega1(0);
            setOmega2(0);
          }}
        >
          重置
        </button>
      </div>
      <div class="inline-block border">
        <canvas ref={canvas!} width={width()} height={height()} />
      </div>
      <p class="text-sm text-gray-600">
        提示：默认使用 RK4 高精度积分；如需更平滑的能量守恒可增大子步数或减小 dt。
      </p>
    </div>
  );
}


