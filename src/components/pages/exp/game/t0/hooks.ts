import { createEffect } from 'solid-js';

// Custom FLIP Animation Hook
export const useFlipAnimation = (
  listAccessor: () => any[],
  options: { duration: number; easing: string } = { duration: 300, easing: 'ease-in-out' }
) => {
  let containerRef: HTMLDivElement | undefined;
  // Store layout positions (left, top) instead of DOMRect to avoid transform interference
  const positions = new Map<string, { left: number; top: number }>();

  createEffect(() => {
    const list = listAccessor(); // Track dependency
    if (!containerRef) return;

    const children = Array.from(containerRef.children) as HTMLElement[];
    const currentPositions = new Map<string, { left: number; top: number }>();

    // 1. Capture current layout positions (unaffected by transforms)
    children.forEach(child => {
      const id = child.dataset.id;
      if (id) {
        currentPositions.set(id, {
          left: child.offsetLeft,
          top: child.offsetTop
        });
      }
    });

    // 2. Compare and Animate
    children.forEach(child => {
      const id = child.dataset.id;
      if (!id) return;

      const newPos = currentPositions.get(id);
      const oldPos = positions.get(id);

      if (newPos && oldPos) {
        const deltaX = oldPos.left - newPos.left;
        const deltaY = oldPos.top - newPos.top;

        // Only animate if there is a significant layout change
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          // Cancel any running animations to prevent conflict
          child.getAnimations().forEach(anim => anim.cancel());

          child.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: 'translate(0, 0)' }
            ],
            {
              duration: options.duration,
              easing: options.easing,
              fill: 'both'
            }
          );
        }
      }
    });

    // 3. Update positions for next run
    positions.clear();
    currentPositions.forEach((pos, id) => positions.set(id, pos));
  });

  return (el: HTMLDivElement) => {
    containerRef = el;
  };
};
