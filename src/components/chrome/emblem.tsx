import { emblemUrl, type Emblem as EmblemData } from "@/lib/emblems";

/**
 * A coat of arms, drawn at a fixed box whatever the shield's proportions.
 *
 * Polish arms are not a consistent shape — some are tall shields, some are
 * near-square, Sopot's is wider than it is high — so they are contained rather
 * than cropped and centred in a square box. Cropping them to a uniform tile
 * would cut the charge out of half the shields on the map.
 *
 * Decorative by default: the city's name is always next to it, and a screen
 * reader announcing "coat of arms of Kraków, Kraków" is noise.
 */
export function Emblem({
  emblem,
  size,
  className = "",
}: {
  emblem: EmblemData;
  /** Box side in pixels. */
  size: number;
  className?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element --
       A local PNG already rendered at its display width. next/image would add
       a resize request and a layout wrapper to a 16-pixel shield that needs
       neither, and on the ranked list there are sixty-six of them. */
    <img
      src={emblemUrl(emblem)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
