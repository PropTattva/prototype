import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'

export default function ComingNext({ title, what }: { title: string; what: string }) {
  return (
    <>
      <PageHeader title={title} subtitle="Next screen in the build order" />
      <Card>
        <p className="text-sm text-ink-soft">{what}</p>
        <p className="mt-2 text-xs text-ink-muted">Placeholder — built after dashboard feedback.</p>
      </Card>
    </>
  )
}
