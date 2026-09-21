import { Link } from 'react-router-dom';
import { useRunSearch } from '../features/search/api';
import { useDashboard } from '../features/settings/api';
import { BotNote } from '../features/bot/BotNote';
import { CountUp, Item, Stagger } from '../components/motion';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, ScoreBar, errMsg, fmtDateTime, useToast } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function StatGroup({ title, items }: { title: string; items: { label: string; value: number | string; to?: string }[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-slate-500">{title}</h3>
      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-card sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr">
        {items.map((i) => {
          const inner = (
            <div className="-mb-px -mr-px h-full border-b border-r border-slate-200 bg-card px-4 py-3.5 transition-colors hover:bg-slate-50">
              <dd className="font-display text-3xl font-semibold tabular-nums text-slate-900">{typeof i.value === "number" ? <CountUp value={i.value} /> : <CountUp value={parseFloat(i.value)} suffix="%" />}</dd>
              <dt className="mt-0.5 text-sm text-slate-600">{i.label}</dt>
            </div>
          );
          return i.to ? <Link key={i.label} to={i.to} className="block">{inner}</Link> : <div key={i.label}>{inner}</div>;
        })}
      </dl>
    </section>
  );
}

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard();
  const run = useRunSearch();
  const toast = useToast();

  const start = () =>
    run.mutate(undefined, {
      onSuccess: () => toast.success('Search started. New jobs will appear as they are found and analyzed.'),
      onError: (e) => toast.error(errMsg(e)),
    });

  if (isLoading) return <Loading rows={4} />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const { totals: t, today } = data;
  const running = data.lastRun?.status === 'RUNNING';

  return (
    <Stagger className="space-y-8">
      <Item><PageHeader
        title={`${greeting()}${data.name ? `, ${data.name}` : ''}`}
        subtitle={`Today: ${today.newJobs} new ${today.newJobs === 1 ? 'job' : 'jobs'}, ${today.strongMatches} strong ${today.strongMatches === 1 ? 'match' : 'matches'}, ${today.pendingReview} waiting for review, ${today.applicationsSent} ${today.applicationsSent === 1 ? 'application' : 'applications'} sent.`}
        actions={<Button variant="primary" loading={run.isPending || running} onClick={start}>{running ? 'Searching…' : 'Find new jobs'}</Button>}
      /></Item>

      <Item><BotNote /></Item>

      <Item><StatGroup
        title="Jobs"
        items={[
          { label: 'Found', value: t.jobsFound, to: '/jobs' },
          { label: 'Analyzed', value: t.jobsAnalyzed },
          { label: 'Strong matches', value: t.strongMatches, to: '/jobs?minScore=80&sort=matchScore' },
          { label: 'Waiting for review', value: t.pendingReview, to: '/jobs?status=REVIEW' },
        ]}
      /></Item>
      <Item><StatGroup
        title="Applications"
        items={[
          { label: 'Sent', value: t.applicationsSent, to: '/applications?status=APPLIED' },
          { label: 'Interviews', value: t.interviews, to: '/applications?status=INTERVIEW' },
          { label: 'Offers', value: t.offers, to: '/applications?status=OFFER' },
          { label: 'Rejected', value: t.rejected, to: '/applications?status=REJECTED' },
          { label: 'Response rate', value: `${data.responseRate}%` },
        ]}
      /></Item>

      <Item><div className="grid gap-6 lg:grid-cols-3">
        <Card title="Best matches waiting for review" className="lg:col-span-2" actions={<Link className="text-sm text-brand-600 hover:underline" to="/jobs?status=REVIEW">View all</Link>}>
          {data.topReview.length === 0 ? (
            <EmptyState title="Nothing to review yet" hint="Run a search or add a job by hand. Good matches show up here." />
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {data.topReview.map((j) => (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}`} className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{j.title}</p>
                      <p className="truncate text-sm text-slate-600">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
                      {j.analysis?.recommendedCv && <p className="text-xs text-slate-500">CV: {j.analysis.recommendedCv.name}</p>}
                    </div>
                    <div className="w-40"><ScoreBar score={j.analysis?.finalMatchScore} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Last search">
          {!data.lastRun ? (
            <p className="text-sm text-slate-600">You haven't run a search yet.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Profile</dt><dd>{data.lastRun.jobSearchProfile?.name ?? '—'}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Status</dt><dd><Badge className={data.lastRun.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : data.lastRun.status === 'RUNNING' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}>{data.lastRun.status.charAt(0) + data.lastRun.status.slice(1).toLowerCase()}</Badge></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Started</dt><dd>{fmtDateTime(data.lastRun.startedAt)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Found / new / duplicates</dt><dd className="tabular-nums">{data.lastRun.jobsFound} / {data.lastRun.jobsNew} / {data.lastRun.duplicatesSkipped}</dd></div>
              {data.lastRun.errors?.length ? <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">{data.lastRun.errors[0].source}: {data.lastRun.errors[0].error}</p> : null}
            </dl>
          )}
        </Card>
      </div></Item>
    </Stagger>
  );
}
