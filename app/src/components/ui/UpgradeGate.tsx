import { featureLabel } from '../../access/policy'
import type { Session } from '../../access/session'
import { href } from '../../state/router'
import PtMark from './PtMark'

/** Shown in place of a screen whose feature flag the org's plan doesn't include (EP-B-S03). */
export default function UpgradeGate({ session, feature }: { session: Session; feature: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-white px-6 py-12 text-center">
      <div className="mb-4 flex justify-center"><PtMark size="lg" /></div>
      <h2 className="text-[15px] font-bold text-royal">{featureLabel(feature)} is not in your plan</h2>
      <p className="mt-2 text-[13px] text-ink-soft">
        {session.org.name} is on <strong className="text-ink">{session.plan?.name ?? 'no active plan'}</strong>. Upgrade to unlock {featureLabel(feature).toLowerCase()}.
      </p>
      <a href={href('subscription')} className="btn btn-gold mt-5">Compare plans</a>
    </div>
  )
}
