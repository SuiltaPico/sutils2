export const isMobileDevice =
  window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
