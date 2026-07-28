import type { CategorySlug } from "@/lib/types";

/**
 * Product silhouettes, drawn per SUBCATEGORY rather than per category.
 *
 * One shape per category made every bag in the shop look like the same bag.
 * Twenty-two shapes is the difference between a catalog that reads as designed
 * and one that reads as a placeholder — a clutch is not a tote, and a hoop is
 * not a pendant.
 *
 * All are drawn in a 200 × 260 field with the same visual weight so they sit
 * together in a grid.
 */

interface Props {
  category: CategorySlug;
  subcategory: string;
  color: string;
}

export function Silhouette({ category, subcategory, color }: Props) {
  const fill = { fill: color, opacity: 0.15 };
  const line = {
    stroke: color,
    strokeWidth: 1.4,
    fill: "none",
    opacity: 0.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const faint = { ...line, opacity: 0.28 };

  const key = `${category}/${subcategory}`;

  switch (key) {
    /* ---------------------------------------------------------- CLOTHING */
    case "clothing/dresses":
      return (
        <g>
          <path d="M78 74 L86 63 L100 71 L114 63 L122 74 L112 104 L132 206 L68 206 L88 104 Z" {...fill} />
          <path d="M78 74 L86 63 L100 71 L114 63 L122 74 L112 104 L132 206 L68 206 L88 104 Z" {...line} />
          <path d="M86 63 L100 85 L114 63" {...faint} />
        </g>
      );

    case "clothing/outerwear":
      return (
        <g>
          <path d="M64 78 L88 66 L100 74 L112 66 L136 78 L132 200 L68 200 Z" {...fill} />
          <path d="M64 78 L88 66 L100 74 L112 66 L136 78 L132 200 L68 200 Z" {...line} />
          <path d="M100 74 V200" {...faint} />
          <path d="M88 66 L100 90 L112 66" {...faint} />
          <path d="M74 128 h14 M112 128 h14" {...faint} />
        </g>
      );

    case "clothing/knitwear":
      return (
        <g>
          <path d="M70 82 L92 70 L108 70 L130 82 L146 128 L134 136 L128 190 L72 190 L66 136 L54 128 Z" {...fill} />
          <path d="M70 82 L92 70 L108 70 L130 82 L146 128 L134 136 L128 190 L72 190 L66 136 L54 128 Z" {...line} />
          <path d="M88 72 C94 82 106 82 112 72" {...faint} />
          {[100, 112, 124].map((y) => (
            <path key={y} d={`M78 ${y} h44`} {...faint} />
          ))}
        </g>
      );

    case "clothing/silk":
      return (
        <g>
          <path d="M72 78 L92 68 L100 76 L108 68 L128 78 L124 196 L76 196 Z" {...fill} />
          <path d="M72 78 L92 68 L100 76 L108 68 L128 78 L124 196 L76 196 Z" {...line} />
          <path d="M100 76 V196" {...faint} />
          {[100, 122, 144, 166].map((y) => (
            <circle key={y} cx="100" cy={y} r="1.8" fill={color} opacity="0.4" />
          ))}
        </g>
      );

    case "clothing/occasion":
      return (
        <g>
          <path d="M84 72 L100 66 L116 72 L110 108 L138 212 L62 212 L90 108 Z" {...fill} />
          <path d="M84 72 L100 66 L116 72 L110 108 L138 212 L62 212 L90 108 Z" {...line} />
          <path d="M90 108 h20" {...faint} />
          <path d="M84 72 C92 80 108 80 116 72" {...faint} />
        </g>
      );

    /* -------------------------------------------------------------- BAGS */
    case "bags/tote":
      return (
        <g>
          <path d="M58 106 H142 L150 202 H50 Z" {...fill} />
          <path d="M58 106 H142 L150 202 H50 Z" {...line} />
          <path d="M78 106 C78 72 122 72 122 106" {...line} />
          <path d="M58 122 H142" {...faint} />
        </g>
      );

    case "bags/shoulder":
      return (
        <g>
          <rect x="60" y="116" width="80" height="70" rx="6" {...fill} />
          <rect x="60" y="116" width="80" height="70" rx="6" {...line} />
          <path d="M60 116 L70 96 H130 L140 116" {...fill} />
          <path d="M60 116 L70 96 H130 L140 116" {...line} />
          <path d="M62 74 C78 74 84 96 100 96 C116 96 122 74 138 74" {...faint} />
          <rect x="93" y="140" width="14" height="9" rx="2" {...faint} />
        </g>
      );

    case "bags/clutch":
      return (
        <g>
          <rect x="46" y="120" width="108" height="56" rx="5" {...fill} />
          <rect x="46" y="120" width="108" height="56" rx="5" {...line} />
          <path d="M46 138 H154" {...faint} />
          <circle cx="100" cy="129" r="5" {...line} />
          <path d="M60 120 C74 104 126 104 140 120" {...faint} />
        </g>
      );

    case "bags/mini":
      return (
        <g>
          <rect x="72" y="122" width="56" height="52" rx="5" {...fill} />
          <rect x="72" y="122" width="56" height="52" rx="5" {...line} />
          <path d="M72 122 L78 106 H122 L128 122" {...line} />
          <path d="M56 68 L72 122 M144 68 L128 122" {...faint} />
          <path d="M56 68 H144" {...faint} />
          <rect x="95" y="140" width="10" height="7" rx="2" {...faint} />
        </g>
      );

    /* ------------------------------------------------------------- SHOES */
    case "shoes/heel":
      return (
        <g>
          <path d="M50 186 C74 182 100 170 118 152 C130 140 138 128 141 116 C143 109 150 110 150 118 C150 144 141 166 128 182 Z" {...fill} />
          <path d="M50 186 C74 182 100 170 118 152 C130 140 138 128 141 116 C143 109 150 110 150 118 C150 144 141 166 128 182 Z" {...line} />
          <path d="M126 182 L136 184 L132 216 L118 216 Z" {...fill} />
          <path d="M126 182 L136 184 L132 216 L118 216 Z" {...line} />
          <path d="M50 186 H132" {...faint} />
        </g>
      );

    case "shoes/flat":
      return (
        <g>
          <path d="M48 176 C62 158 88 148 116 148 C140 148 152 158 152 170 C152 182 140 190 116 190 L58 190 C50 190 46 184 48 176Z" {...fill} />
          <path d="M48 176 C62 158 88 148 116 148 C140 148 152 158 152 170 C152 182 140 190 116 190 L58 190 C50 190 46 184 48 176Z" {...line} />
          <path d="M78 154 C86 164 104 164 112 154" {...faint} />
          <path d="M48 190 H152" {...faint} />
        </g>
      );

    case "shoes/boot":
      return (
        <g>
          <path d="M78 60 H120 L124 156 L150 168 C158 172 158 186 148 186 H78 Z" {...fill} />
          <path d="M78 60 H120 L124 156 L150 168 C158 172 158 186 148 186 H78 Z" {...line} />
          <path d="M78 100 H122" {...faint} />
          <path d="M124 156 L112 160" {...faint} />
          <path d="M78 186 V206 H96 V186" {...faint} />
        </g>
      );

    case "shoes/sandal":
      return (
        <g>
          <path d="M46 172 C64 160 90 154 118 154 C142 154 152 162 152 172 C152 182 142 188 118 188 L56 188 C46 188 42 178 46 172Z" {...fill} />
          <path d="M46 172 C64 160 90 154 118 154 C142 154 152 162 152 172 C152 182 142 188 118 188 L56 188 C46 188 42 178 46 172Z" {...line} />
          <path d="M66 160 C82 138 108 138 124 158" {...line} />
          <path d="M76 156 C90 144 106 144 118 156" {...faint} />
        </g>
      );

    /* --------------------------------------------------------- JEWELLERY */
    case "jewellery/earrings":
      return (
        <g>
          {[72, 128].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="96" r="24" {...fill} />
              <circle cx={cx} cy="96" r="24" {...line} />
              <circle cx={cx} cy="96" r="15" {...faint} />
              <path d={`M${cx} 120 v18`} {...line} />
              <circle cx={cx} cy="150" r="10" {...fill} />
              <circle cx={cx} cy="150" r="10" {...line} />
            </g>
          ))}
        </g>
      );

    case "jewellery/necklaces":
      return (
        <g>
          <path d="M48 74 C48 132 70 160 100 160 C130 160 152 132 152 74" {...line} />
          <path d="M56 74 C56 126 74 150 100 150 C126 150 144 126 144 74" {...faint} />
          <circle cx="100" cy="176" r="15" {...fill} />
          <circle cx="100" cy="176" r="15" {...line} />
          <circle cx="100" cy="176" r="6" {...faint} />
          <path d="M100 160 v1" {...line} />
        </g>
      );

    case "jewellery/rings":
      return (
        <g>
          <ellipse cx="100" cy="140" rx="42" ry="46" {...fill} />
          <ellipse cx="100" cy="140" rx="42" ry="46" {...line} />
          <ellipse cx="100" cy="140" rx="30" ry="34" {...line} />
          <ellipse cx="100" cy="82" rx="20" ry="13" {...fill} />
          <ellipse cx="100" cy="82" rx="20" ry="13" {...line} />
        </g>
      );

    case "jewellery/bracelets":
      return (
        <g>
          <ellipse cx="100" cy="130" rx="52" ry="40" {...fill} />
          <ellipse cx="100" cy="130" rx="52" ry="40" {...line} />
          <ellipse cx="100" cy="130" rx="40" ry="29" {...line} />
          <path d="M62 104 C74 92 126 92 138 104" {...faint} />
          <circle cx="100" cy="90" r="4" fill={color} opacity="0.4" />
        </g>
      );

    /* ------------------------------------------------------------ BEAUTY */
    case "beauty/lip":
      return (
        <g>
          <rect x="84" y="118" width="32" height="84" rx="4" {...fill} />
          <rect x="84" y="118" width="32" height="84" rx="4" {...line} />
          <rect x="86" y="72" width="28" height="46" rx="3" {...fill} />
          <rect x="86" y="72" width="28" height="46" rx="3" {...line} />
          <path d="M86 84 L114 76" {...faint} />
          <path d="M84 138 H116" {...faint} />
        </g>
      );

    case "beauty/complexion":
      return (
        <g>
          <path d="M74 110 H126 L130 200 C130 204 127 206 124 206 H76 C73 206 70 204 70 200 Z" {...fill} />
          <path d="M74 110 H126 L130 200 C130 204 127 206 124 206 H76 C73 206 70 204 70 200 Z" {...line} />
          <rect x="90" y="86" width="20" height="24" rx="2" {...fill} />
          <rect x="90" y="86" width="20" height="24" rx="2" {...line} />
          <path d="M96 68 h8 v18 h-8 z" {...faint} />
          <path d="M74 150 H126" {...faint} />
        </g>
      );

    case "beauty/eyes":
      return (
        <g>
          <path d="M96 60 L104 60 L108 96 L92 96 Z" {...fill} />
          <path d="M96 60 L104 60 L108 96 L92 96 Z" {...line} />
          <rect x="88" y="96" width="24" height="86" rx="3" {...fill} />
          <rect x="88" y="96" width="24" height="86" rx="3" {...line} />
          <path d="M92 182 L108 182 L104 208 L96 208 Z" {...fill} />
          <path d="M92 182 L108 182 L104 208 L96 208 Z" {...line} />
        </g>
      );

    case "beauty/skincare":
      return (
        <g>
          <rect x="70" y="104" width="60" height="98" rx="8" {...fill} />
          <rect x="70" y="104" width="60" height="98" rx="8" {...line} />
          <rect x="88" y="76" width="24" height="28" rx="3" {...fill} />
          <rect x="88" y="76" width="24" height="28" rx="3" {...line} />
          <path d="M92 62 h16 v14 h-16 z" {...faint} />
          <rect x="80" y="132" width="40" height="34" rx="2" {...faint} />
        </g>
      );

    case "beauty/fragrance":
      return (
        <g>
          <path d="M68 118 C68 108 78 104 78 96 H122 C122 104 132 108 132 118 V196 C132 202 128 206 122 206 H78 C72 206 68 202 68 196 Z" {...fill} />
          <path d="M68 118 C68 108 78 104 78 96 H122 C122 104 132 108 132 118 V196 C132 202 128 206 122 206 H78 C72 206 68 202 68 196 Z" {...line} />
          <rect x="86" y="62" width="28" height="34" rx="3" {...fill} />
          <rect x="86" y="62" width="28" height="34" rx="3" {...line} />
          <rect x="80" y="140" width="40" height="30" rx="2" {...faint} />
        </g>
      );

    /* ------------------------------------------------------- ACCESSORIES */
    case "accessories/scarves":
      return (
        <g>
          <path d="M100 58 L154 130 L100 202 L46 130 Z" {...fill} />
          <path d="M100 58 L154 130 L100 202 L46 130 Z" {...line} />
          <path d="M100 84 L132 130 L100 176 L68 130 Z" {...faint} />
          <path d="M100 110 L114 130 L100 150 L86 130 Z" {...faint} />
          <circle cx="100" cy="130" r="4" fill={color} opacity="0.4" />
        </g>
      );

    case "accessories/sunglasses":
      return (
        <g>
          <path d="M40 116 C40 106 58 102 68 106 C78 110 80 132 70 140 C58 149 40 142 40 128 Z" {...fill} />
          <path d="M40 116 C40 106 58 102 68 106 C78 110 80 132 70 140 C58 149 40 142 40 128 Z" {...line} />
          <path d="M160 116 C160 106 142 102 132 106 C122 110 120 132 130 140 C142 149 160 142 160 128 Z" {...fill} />
          <path d="M160 116 C160 106 142 102 132 106 C122 110 120 132 130 140 C142 149 160 142 160 128 Z" {...line} />
          <path d="M78 114 C88 108 112 108 122 114" {...line} />
          <path d="M40 112 L26 104 M160 112 L174 104" {...faint} />
        </g>
      );

    case "accessories/belts":
      return (
        <g>
          <path d="M36 118 H130 V150 H36 Z" {...fill} />
          <path d="M36 118 H130 V150 H36 Z" {...line} />
          <rect x="130" y="110" width="34" height="48" rx="4" {...line} />
          <path d="M147 110 V158" {...faint} />
          {[58, 76, 94, 112].map((x) => (
            <circle key={x} cx={x} cy="134" r="3" {...faint} />
          ))}
        </g>
      );

    case "accessories/small-leather":
      return (
        <g>
          <rect x="56" y="106" width="88" height="66" rx="5" {...fill} />
          <rect x="56" y="106" width="88" height="66" rx="5" {...line} />
          <path d="M56 124 H144" {...faint} />
          <path d="M68 148 H132" {...faint} />
          <circle cx="138" cy="115" r="3.5" fill={color} opacity="0.4" />
        </g>
      );

    /* ------------------------------------------------------------ FALLBACK */
    default:
      return (
        <g>
          <circle cx="100" cy="130" r="46" {...fill} />
          <circle cx="100" cy="130" r="46" {...line} />
          <circle cx="100" cy="130" r="30" {...faint} />
        </g>
      );
  }
}
