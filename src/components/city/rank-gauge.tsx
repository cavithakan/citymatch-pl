/**
 * Where this city falls among all 66, drawn as a scale rather than written as
 * a number.
 *
 * A rank is a position, and a position is easier to judge than to read: "8th of
 * 66" takes a moment of arithmetic, whereas a mark near the left edge does not.
 * One tick per city means the gauge also shows how crowded the field is around
 * this city — a mark in a dense middle says something different from a mark
 * standing alone at the end.
 *
 * The written rank stays in the markup for screen readers and for anyone who
 * wants the exact figure.
 */
export function RankGauge({
  rank,
  total,
  label,
}: {
  rank: number;
  total: number;
  label: string;
}) {
  const width = 132;
  const height = 14;
  const step = width / total;

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="shrink-0 overflow-visible"
      >
        {Array.from({ length: total }, (_, i) => {
          const position = i + 1;
          const isCity = position === rank;
          const x = i * step + step / 2;
          return (
            <line
              key={position}
              x1={x}
              x2={x}
              y1={isCity ? 0 : height * 0.32}
              y2={isCity ? height : height * 0.68}
              stroke={isCity ? "var(--color-brass)" : "var(--color-glass-line)"}
              strokeWidth={isCity ? 2 : 1}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <span className="whitespace-nowrap text-xs text-muted">{label}</span>
    </span>
  );
}
