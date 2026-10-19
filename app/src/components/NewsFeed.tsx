import { useState } from 'react'
import type { Session } from '../access/session'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import { fmtDate } from '../lib/dates'
import type { NewsItem } from '../lib/news'
import { href } from '../state/router'
import Card from './ui/Card'

const FILTERS = ['All', 'Portfolio', 'Market'] as const
type Filter = (typeof FILTERS)[number]

/** Lease news: portfolio activity from the viewer's scope plus sample market headlines. */
export default function NewsFeed({ session }: { session: Session }) {
  const { data } = useApi(() => api.leaseNews(session), [session.user.user_id])
  const [filter, setFilter] = useState<Filter>('All')
  const [expanded, setExpanded] = useState(false)
  const items = (data ?? []).filter((n) => filter === 'All' || n.kind === filter)
  const shown = expanded ? items : items.slice(0, 5)
  return (
    <Card
      title="Lease news"
      sub="Deals, renewals and market headlines · market items are sample content"
      action={
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filter === f ? 'bg-royal text-white' : 'bg-hover text-ink-soft hover:text-royal'}`}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      {!items.length ? (
        <p className="py-6 text-center text-sm text-ink-muted">No news yet</p>
      ) : (
        <ul className="divide-y divide-line-light">
          {shown.map((n) => <NewsRow key={n.id} n={n} />)}
        </ul>
      )}
      {items.length > 5 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 text-xs font-semibold text-royal hover:underline">
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}

function NewsRow({ n }: { n: NewsItem }) {
  return (
    <li className="py-3.5 first:pt-1">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-muted">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${n.kind === 'Portfolio' ? 'bg-royal-soft text-royal' : 'bg-gold-light text-gold-dark'}`}>
          {n.kind === 'Market' ? 'Market · sample' : 'Your portfolio'}
        </span>
        {fmtDate(n.date)}
      </div>
      <h4 className="text-[15px] font-bold leading-snug text-ink">
        {n.link ? <a href={href(n.link)} className="hover:text-royal hover:underline">{n.headline}</a> : n.headline}
      </h4>
      <p className="mt-1 text-[13px] text-ink-soft">{n.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
        <span className="text-ink-muted">Category:</span>
        {n.categories.map((c) => <span key={c} className="rounded bg-hover px-1.5 py-0.5 text-ink-soft">{c}</span>)}
        <span className="ml-2 text-ink-muted">Tags:</span>
        <span className="text-royal">{n.tags.join(', ')}</span>
      </div>
    </li>
  )
}
