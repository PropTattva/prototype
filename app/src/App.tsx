import { AppProvider, useApp } from './state/AppContext'
import AppShell from './components/layout/AppShell'
import Dashboard from './screens/Dashboard'
import ComingNext from './screens/ComingNext'

function Screen() {
  const { view, parkId } = useApp()
  switch (view) {
    case 'dashboard':
      return <Dashboard />
    case 'parks':
      return <ComingNext title={parkId ? `Park ${parkId}` : 'Parks'} what="Parks list → park detail with snapshot chips, top occupiers, transactions and the colour-coded stacking plan." />
    case 'availability':
      return <ComingNext title="Availability explorer" what="Filterable availability across parks (city, handover condition) with totals." />
    case 'organisations':
      return <ComingNext title="Organisations" what="Owner orgs, plans/tiers and parks per owner — the tenant-isolation view." />
  }
}

export default function App() {
  return (
    <AppProvider>
      <AppShell>
        <Screen />
      </AppShell>
    </AppProvider>
  )
}
