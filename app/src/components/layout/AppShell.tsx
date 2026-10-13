import type { ReactNode } from 'react'
import TopBar from './TopBar'
import SideNav from './SideNav'
import { useApp } from '../../state/AppContext'

export default function AppShell({ children }: { children: ReactNode }) {
  const { publicLens, setPublicLens } = useApp()
  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto flex max-w-[1440px] flex-col md:flex-row">
        <SideNav />
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          {publicLens && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span>
                <b>Occupier / public lens:</b> tenant names and commercials are masked, as an occupier or broker would see them.
              </span>
              <button onClick={() => setPublicLens(false)} className="font-semibold underline">Exit lens</button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
