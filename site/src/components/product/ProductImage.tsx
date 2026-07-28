import Image from "next/image";
import { Silhouette } from "@/components/product/silhouettes";
import type { CategorySlug } from "@/lib/types";

/**
 * Generated editorial art.
 *
 * Until real photography exists, every product renders a deterministic plate
 * derived from its id: a duotone ground, its subcategory silhouette, the house
 * motif tiled behind it, and a grain pass. Same product, same plate, every time
 * and on every device — it is a pure function of the id, so server and client
 * agree and nothing shifts on hydration.
 *
 * The moment a product gains an `image`, that photo renders instead and this
 * code is bypassed entirely. Swapping in real photography is one field per row.
 */

/* -------------------------------------------------------------------------
   Deterministic selection
   ------------------------------------------------------------------------- */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Curated duotone grounds.
 *
 * Wider in chroma than a single neutral family, so a grid of twelve products
 * does not read as twelve copies of the same plate — but every pair is drawn
 * from the indienne palette, so they still sit together.
 */
const GROUNDS: { from: string; to: string; ink: string }[] = [
  { from: "#F4EEE2", to: "#D8C6A4", ink: "#6B5636" }, // bone / camel
  { from: "#EDE9E3", to: "#B9AE9B", ink: "#4E4737" }, // oat
  { from: "#F2E9E5", to: "#CBA294", ink: "#7A4A38" }, // rose clay
  { from: "#E5EAE6", to: "#9FB2A4", ink: "#3F5145" }, // celadon
  { from: "#E7E9EF", to: "#9DA9BF", ink: "#36415A" }, // indigo mist
  { from: "#F4EFDF", to: "#D9BE7C", ink: "#755E27" }, // gold leaf
  { from: "#EFE6E9", to: "#B99BA8", ink: "#573B47" }, // plum
  { from: "#EDE7E0", to: "#B3937E", ink: "#5E4534" }, // espresso
  { from: "#E9EBEE", to: "#A2A9B4", ink: "#3C434E" }, // slate
  { from: "#F5EDE6", to: "#C99479", ink: "#7C452C" }, // madder
  { from: "#EAEDE9", to: "#8FA394", ink: "#37493D" }, // deep sage
  { from: "#F1EDE4", to: "#C3B292", ink: "#5F5238" }, // parchment
];

/* -------------------------------------------------------------------------
   The plate
   ------------------------------------------------------------------------- */

interface ProductImageProps {
  id: string;
  name: string;
  category: CategorySlug;
  subcategory?: string;
  /** Real photograph. When present, everything above is skipped. */
  image?: string;
  /** Tints the ground toward the selected colourway. */
  tint?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

export function ProductImage({
  id,
  name,
  category,
  subcategory = "",
  image,
  tint,
  className = "",
  priority = false,
  sizes = "(max-width: 768px) 50vw, 25vw",
}: ProductImageProps) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );
  }

  const seed = hash(id);
  const ground = GROUNDS[seed % GROUNDS.length]!;
  const angle = 15 + (seed % 7) * 12;
  const motifScale = 24 + (seed % 5) * 7;

  // Three compositions, so plates of the same colourway still differ.
  const composition = seed % 3;
  // Subtle scale and drop variation, so a grid does not look stamped.
  const scale = 0.92 + ((seed >> 3) % 5) * 0.045;
  const drop = -6 + ((seed >> 5) % 5) * 5;

  const uid = `pi-${id.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox="0 0 200 260"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label={name}
    >
      <defs>
        <linearGradient id={`${uid}-g`} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
          <stop offset="0%" stopColor={ground.from} />
          <stop offset="100%" stopColor={tint ?? ground.to} />
        </linearGradient>

        {/* Vignette: pulls the eye to the centre of the plate. */}
        <radialGradient id={`${uid}-v`} cx="50%" cy="42%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
        </radialGradient>

        {/* The house motif, tiled behind the silhouette. */}
        <pattern
          id={`${uid}-p`}
          width={motifScale}
          height={motifScale}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${seed % 45})`}
        >
          <g
            stroke={ground.ink}
            strokeWidth="0.55"
            fill="none"
            opacity="0.26"
            transform={`scale(${motifScale / 100})`}
          >
            {[0, 90, 180, 270].map((a) => (
              <path
                key={a}
                transform={`rotate(${a} 50 50)`}
                d="M50 50 C50 36 44 30 50 18 C56 30 50 36 50 50Z"
              />
            ))}
            <circle cx="50" cy="50" r="4" />
          </g>
        </pattern>

        {/* Grain. Without it the gradients read as flat CSS; with it, as print. */}
        <filter id={`${uid}-n`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed={seed % 100} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.055" />
          </feComponentTransfer>
        </filter>
      </defs>

      <rect width="200" height="260" fill={`url(#${uid}-g)`} />
      <rect width="200" height="260" fill={`url(#${uid}-p)`} />

      {/* Composition 0 — a studio horizon, as in a tabletop still life. */}
      {composition === 0 && (
        <>
          <rect y="168" width="200" height="92" fill={ground.ink} opacity="0.07" />
          <path d="M0 168 H200" stroke={ground.ink} strokeWidth="0.6" opacity="0.2" />
        </>
      )}

      {/* Composition 1 — a full-height plinth behind the piece. */}
      {composition === 1 && (
        <rect x="46" y="30" width="108" height="230" fill="#FFFFFF" opacity="0.28" />
      )}

      {/* Composition 2 — a raking light disc. */}
      {composition === 2 && (
        <circle cx="100" cy="112" r="76" fill="#FFFFFF" opacity="0.24" />
      )}

      {/* A soft light source, top-left, so every plate has a direction. */}
      <ellipse cx="58" cy="52" rx="86" ry="70" fill="#FFFFFF" opacity="0.18" />

      <g transform={`translate(100 ${130 + drop}) scale(${scale}) translate(-100 -130)`}>
        <Silhouette category={category} subcategory={subcategory} color={ground.ink} />
      </g>

      <rect width="200" height="260" fill={`url(#${uid}-v)`} />
      <rect width="200" height="260" filter={`url(#${uid}-n)`} opacity="0.9" />

      {/* Hairline frame, inset. The detail that makes it read as a plate. */}
      <rect
        x="7"
        y="7"
        width="186"
        height="246"
        fill="none"
        stroke={ground.ink}
        strokeWidth="0.5"
        opacity="0.22"
      />
    </svg>
  );
}

/**
 * Wider variant for hero and editorial blocks — same system, 16:10 field, no
 * silhouette, so text can sit over it.
 */
export function EditorialPlate({
  seed: seedInput,
  className = "",
}: {
  seed: string;
  className?: string;
}) {
  const seed = hash(seedInput);
  const ground = GROUNDS[seed % GROUNDS.length]!;
  const uid = `ep-${seedInput.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${uid}-g`}
          gradientTransform={`rotate(${25 + (seed % 6) * 10} 0.5 0.5)`}
        >
          <stop offset="0%" stopColor={ground.from} />
          <stop offset="100%" stopColor={ground.to} />
        </linearGradient>
        <pattern
          id={`${uid}-p`}
          width="34"
          height="34"
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${seed % 30})`}
        >
          <g stroke={ground.ink} strokeWidth="0.5" fill="none" opacity="0.25" transform="scale(0.34)">
            {[0, 90, 180, 270].map((a) => (
              <path
                key={a}
                transform={`rotate(${a} 50 50)`}
                d="M50 50 C50 36 44 30 50 18 C56 30 50 36 50 50Z"
              />
            ))}
            <circle cx="50" cy="50" r="4" />
          </g>
        </pattern>
        <filter id={`${uid}-n`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed={seed % 100} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.05" />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect width="320" height="200" fill={`url(#${uid}-g)`} />
      <rect width="320" height="200" fill={`url(#${uid}-p)`} />
      <ellipse cx="90" cy="40" rx="150" ry="110" fill="#FFFFFF" opacity="0.2" />
      <rect width="320" height="200" filter={`url(#${uid}-n)`} opacity="0.9" />
    </svg>
  );
}
