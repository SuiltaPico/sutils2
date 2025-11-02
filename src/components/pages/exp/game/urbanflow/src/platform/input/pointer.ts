export type PointerHandlers = {
  onMove?: (e: { screenX: number; screenY: number; worldX: number; worldY: number; ev: PointerEvent }) => void;
  onDown?: (e: { button: number; screenX: number; screenY: number; worldX: number; worldY: number; ev: PointerEvent }) => void;
  onUp?: (e: { button: number; screenX: number; screenY: number; worldX: number; worldY: number; ev: PointerEvent }) => void;
  onLeave?: (e: { ev: PointerEvent }) => void;
  onWheel?: (e: { screenX: number; screenY: number; worldX: number; worldY: number; deltaY: number; ev: WheelEvent }) => void;
};

export type ToWorld = (screenX: number, screenY: number) => { worldX: number; worldY: number };

export function attachPointer(container: HTMLElement, toWorld: ToWorld, handlers: PointerHandlers) {
  const onMove = (ev: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const { worldX, worldY } = toWorld(x, y);
    handlers.onMove?.({ screenX: x, screenY: y, worldX, worldY, ev });
  };
  const onDown = (ev: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const { worldX, worldY } = toWorld(x, y);
    handlers.onDown?.({ button: ev.button, screenX: x, screenY: y, worldX, worldY, ev });
  };
  const onUp = (ev: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const { worldX, worldY } = toWorld(x, y);
    handlers.onUp?.({ button: ev.button, screenX: x, screenY: y, worldX, worldY, ev });
  };
  const onLeave = (ev: PointerEvent) => {
    handlers.onLeave?.({ ev });
  };
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const { worldX, worldY } = toWorld(x, y);
    handlers.onWheel?.({ screenX: x, screenY: y, worldX, worldY, deltaY: ev.deltaY, ev });
  };

  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerdown", onDown);
  container.addEventListener("pointerup", onUp);
  container.addEventListener("pointerleave", onLeave);
  container.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerdown", onDown);
    container.removeEventListener("pointerup", onUp);
    container.removeEventListener("pointerleave", onLeave);
    container.removeEventListener("wheel", onWheel as any);
  };
}


