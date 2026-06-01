export function round(n, d = 2) {
  if (!Number.isFinite(Number(n))) return null;
  const m = 10 ** d;
  return Math.round(Number(n) * m) / m;
}

export function clamp(n, min, max) {
  if (!Number.isFinite(Number(n))) return min;
  return Math.max(min, Math.min(max, Number(n)));
}

export function mean(arr) {
  const x = arr.filter(Number.isFinite);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
}

export function std(arr) {
  const m = mean(arr);
  if (m == null) return null;
  const x = arr.filter(Number.isFinite);
  if (x.length < 2) return null;
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}