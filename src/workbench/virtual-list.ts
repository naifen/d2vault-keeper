/**
 * Chunked / windowed list math for 1000+ vault rows without mounting all DOM nodes.
 */

export interface WindowRange {
  startIndex: number;
  endIndex: number; // exclusive
  offsetY: number;
  totalHeight: number;
}

export function visibleWindow(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
  rowHeight: number,
  overscan = 8,
): WindowRange {
  const totalHeight = itemCount * rowHeight;
  if (itemCount <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }
  const rawStart = Math.floor(scrollTop / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(itemCount, rawStart + visible + overscan);
  return {
    startIndex,
    endIndex,
    offsetY: startIndex * rowHeight,
    totalHeight,
  };
}
