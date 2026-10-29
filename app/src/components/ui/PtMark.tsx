// Brand guide: navy R16 G43 B78, copper R179 G102 B40 (lit from above), Aileron.
const NAVY = '#102B4E'
const COPPER_TEXT = 'linear-gradient(180deg, #E8A06A 0%, #C77B3E 45%, #B36628 100%)'

/**
 * The proptattva wordmark: "prop" in navy, "tattva" in copper, then the Kaspian "i" mark —
 * a copper bar that runs in over the last letter, a navy dot, and a copper stem.
 */
export default function PtMark({ size = 'sm', onDark = false }: { size?: 'sm' | 'lg'; onDark?: boolean }) {
  return (
    <span
      role="img"
      aria-label="proptattva"
      className={`inline-flex shrink-0 items-baseline whitespace-nowrap font-brand font-bold leading-none tracking-[-0.01em] ${size === 'lg' ? 'text-[34px]' : 'text-[24px]'}`}
    >
      <span style={{ color: onDark ? '#fff' : NAVY }}>prop</span>
      <span style={{ backgroundImage: COPPER_TEXT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>tattva</span>
      {/* 1 unit = 0.01em; the bottom edge sits on the text baseline */}
      <svg viewBox="0 0 74 92" aria-hidden="true" style={{ width: '0.74em', height: '0.92em', marginLeft: '-0.37em', flexShrink: 0 }}>
        <defs>
          <linearGradient id="pt-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#E39A62" />
            <stop offset="1" stopColor="#B36628" />
          </linearGradient>
          <linearGradient id="pt-stem" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C77B3E" />
            <stop offset="1" stopColor="#B36628" />
          </linearGradient>
        </defs>
        <rect x="0" y="2" width="54" height="9" fill="url(#pt-bar)" />
        <circle cx="66.5" cy="7" r="7" fill={onDark ? '#fff' : NAVY} />
        <rect x="61" y="31" width="11" height="46" fill="url(#pt-stem)" />
      </svg>
    </span>
  )
}
