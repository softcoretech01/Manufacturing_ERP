import { PORTALS } from '@/config/portals'
import { FeatureIcons } from './FeatureIcons'
import { Statistics } from './Statistics'

/**
 * Hero section — occupies the 60% left panel.
 * The factory photo is injected as a full-page background in Login.tsx;
 * this component is responsible only for the text and feature grid overlay.
 */

export function HeroSection() {
  return (
    <div className="relative flex h-full flex-col justify-between gap-10 px-10 pb-14 pt-0 xl:px-14 2xl:px-16">
      {/* Push copy down below the top bar */}
      <div className="flex-1 flex flex-col justify-center mt-8">
        <Copy />
      </div>
      <Statistics className="-ml-4 mb-6 xl:-ml-6 xl:mb-8" />
    </div>
  )
}

/* ─── Heading copy ─── */
function Copy() {
  return (
    <div className="max-w-[520px]">
      <h1
        className="font-bold tracking-tight text-white"
        style={{
          fontSize: 'clamp(32px, 3vw, 42px)',
          lineHeight: 1.22,
          textShadow: '0 2px 20px rgba(0,0,0,0.3)',
        }}
      >
        One Platform.<br />
        Complete Manufacturing.<br />
        From Steel Coil<br />
        to{' '}
        <span className="text-blue-400">Customer Delivery.</span>
      </h1>

      {/* 8-item glassmorphic feature cards */}
      <FeatureIcons className="mt-8" />
    </div>
  )
}

/* Keep DrawnPlant exported for any legacy reference */
export function DrawnPlant() { return null }
