export type KeyboardHandlers = {
  onKey?: (e: KeyboardEvent) => void;
};

export function attachKeyboard(target: HTMLElement | Window, handlers: KeyboardHandlers) {
  const onKeyDown = (ev: KeyboardEvent) => {
    handlers.onKey?.(ev);
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}


