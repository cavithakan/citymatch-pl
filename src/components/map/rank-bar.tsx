"use client";

/**
 * Where a city falls among the ranked field, drawn as a scale rather than
 * written as a number.
 *
 * A rank is a position, and a position is quicker to judge than to read: "8th
 * of 66" takes a beat of arithmetic, a mark near the left edge does not. One
 * tick per city also shows how crowded the field is around this one — a mark in
 * a dense middle means something different from a mark standing alone at the
 * end. The written rank stays beside it for anyone who wants the figure, and
 * for screen readers.
 */
export function RankBar({
  rank,
  total,
  label,
  width = 116,
}: {
  rank: number;
  total: number;
  label: string;
  width?: number;
}) {
  const height = 13;
  const step = width / total;

  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="shrink-0 overflow-visible"
      >
        {Array.from({ length: total }, (_, i) => {
          const isCity = i + 1 === rank;
          const x = i * step + step / 2;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={isCity ? 0 : height * 0.34}
              y2={isCity ? height : height * 0.66}
              stroke={isCity ? "var(--color-brass)" : "var(--color-glass-line)"}
              strokeWidth={isCity ? 2 : 1}
            />
          );
        })}
      </svg>
      <span className="whitespace-nowrap text-[11px] text-faint">{label}</span>
    </span>
  );
}
