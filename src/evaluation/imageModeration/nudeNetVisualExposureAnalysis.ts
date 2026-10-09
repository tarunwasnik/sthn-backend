export type Rectangle = readonly [number, number, number, number];

/** Exact union area of source-pixel rectangles, clipped to the source bounds. */
export const rectangleUnionArea = (rectangles: Rectangle[], sourceWidth: number, sourceHeight: number) => {
  const rs = rectangles.map(([x, y, w, h]) => ({ x1: Math.max(0, x), y1: Math.max(0, y), x2: Math.min(sourceWidth, x + w), y2: Math.min(sourceHeight, y + h) }))
    .filter(r => r.x2 > r.x1 && r.y2 > r.y1);
  const xs = [...new Set(rs.flatMap(r => [r.x1, r.x2]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const [left, right] = [xs[i], xs[i + 1]];
    const intervals = rs.filter(r => r.x1 < right && r.x2 > left).map(r => [r.y1, r.y2] as const).sort((a, b) => a[0] - b[0]);
    let covered = 0, end = -Infinity;
    for (const [top, bottom] of intervals) { if (bottom > end) { covered += bottom - Math.max(top, end); end = Math.max(end, bottom); } }
    area += (right - left) * covered;
  }
  return area;
};

export const descriptiveStats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  return { count: sorted.length, zeroCount: sorted.filter(x => x === 0).length, min: q(0), p25: q(.25), median: q(.5), p75: q(.75), max: q(1), mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null };
};
