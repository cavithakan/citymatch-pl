/**
 * A decade of one indicator, drawn small enough to sit inside a table row.
 *
 * The line answers a question the current value cannot: whether the city is
 * moving toward or away from where it stands today. No axes — at this size they
 * would cost more room than they explain, and the first and last years are
 * printed beside it.
 */
export function Sparkline({
  points,
  ariaLabel,
}: {
  points: { year: number; value: number }[];
  ariaLabel: string;
}) {
  if (points.length < 2) return null;

  const width = 86;
  const height = 22;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    // Inset by a pixel top and bottom so the extremes are not clipped.
    const y = height - 1 - ((p.value - min) / span) * (height - 2);
    return [x, y] as const;
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="shrink-0 overflow-visible"
    >
      <path d={path} fill="none" stroke="var(--color-ramp-1)" strokeWidth={1.25} />
      <circle cx={lastX} cy={lastY} r={2} fill="var(--color-brass)" />
    </svg>
  );
}
