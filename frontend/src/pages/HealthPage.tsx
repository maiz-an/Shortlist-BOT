import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { fmtDuration, useHealthDetails } from '../features/health/api';
import type { CheckStatus } from '../features/health/api';
import { Item, Stagger } from '../components/motion';
import { Badge, Card, ErrorState, Loading, PageHeader, cx } from '../components/ui';

const APP_VERSION = '1.1.0';

function useTicker(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function StatusIcon({ status, className = 'h-5 w-5' }: { status: CheckStatus; className?: string }) {
  if (status === 'ok') return <CheckCircle2 className={cx(className, 'text-emerald-600')} />;
  if (status === 'warn') return <AlertTriangle className={cx(className, 'text-amber-600')} />;
  return <XCircle className={cx(className, 'text-rose-600')} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900 tabular-nums">{children}</dd>
    </div>
  );
}

function Meter({ value, max, warnAt = 0.75 }: { value: number; max: number; warnAt?: number }) {
  const ratio = Math.min(value / Math.max(max, 1), 1);
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200" role="presentation">
      <div className={cx('h-full rounded-full transition-all duration-500', ratio > warnAt ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${Math.max(ratio * 100, 2)}%` }} />
    </div>
  );
}

const latencyTone = (ms: number | null) => (ms === null ? 'text-slate-500' : ms > 800 ? 'text-amber-700' : 'text-emerald-700');

export function HealthPage() {
  const { data, error, isLoading, refetch, dataUpdatedAt } = useHealthDetails(5000);
  useTicker();

  const sessionSeconds = (Date.now() - performance.timeOrigin) / 1000;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const ago = dataUpdatedAt ? Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000)) : null;

  if (isLoading) return <Loading rows={4} />;

  if (error || !data) {
    return (
      <div>
        <PageHeader title="App health" subtitle="Live status of every part of Shortlist BOT." />
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">The backend is not responding.</p>
            <p className="mt-0.5">The interface is running, but it cannot reach the API on port 5871. Start it with <code>npm run start:dev</code> in the backend folder.</p>
          </div>
        </div>
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const { backend: b, ai, database: db } = data;
  const backendStarted = new Date(b.startedAt).getTime();
  const backendUptime = (Date.now() - backendStarted) / 1000;
  const problems = data.checks.filter((c) => c.status !== 'ok');
  const headline = data.overall === 'ok' ? 'Everything is running.' : data.overall === 'warn' ? 'Running, with things that need attention.' : 'Something is down.';
  const memFree = b.systemMemoryMb.free;

  return (
    <Stagger className="space-y-6">
      <Item>
        <PageHeader
          title="App health"
          subtitle="Live status of every part of Shortlist BOT. Refreshes every 5 seconds."
          actions={<span className="self-center text-xs text-slate-500">Updated {ago === null ? '…' : ago === 0 ? 'just now' : `${ago}s ago`}</span>}
        />
      </Item>

      <Item>
        <div className={cx('flex items-center gap-3 rounded-lg border px-4 py-3', data.overall === 'ok' ? 'border-emerald-200 bg-emerald-50' : data.overall === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50')}>
          <StatusIcon status={data.overall} className="h-6 w-6" />
          <div>
            <p className="font-medium text-slate-900">{headline}</p>
            <p className="text-sm text-slate-600">{problems.length === 0 ? `${data.checks.length} checks passed.` : `${problems.length} of ${data.checks.length} checks need a look (below).`}</p>
          </div>
        </div>
      </Item>

      <Item>
        <div className="grid gap-4 md:grid-cols-2">
          <Card title={<span className="flex items-center gap-2"><StatusIcon status="ok" className="h-4 w-4" />Frontend</span>}>
            <dl className="divide-y divide-slate-100">
              <Row label="Status">Running</Row>
              <Row label="Open for">{fmtDuration(sessionSeconds)}</Row>
              <Row label="Page load">{nav ? `${Math.round(nav.duration)} ms` : '—'}</Row>
              <Row label="API round trip"><span className={latencyTone(data.clientLatencyMs)}>{data.clientLatencyMs} ms</span></Row>
              <Row label="Browser">{navigator.onLine ? 'Online' : 'Offline'}</Row>
              <Row label="Memory">{heap ? `${Math.round(heap.usedJSHeapSize / 1048576)} MB` : 'Not reported'}</Row>
              <Row label="Version">{APP_VERSION} ({import.meta.env.MODE})</Row>
            </dl>
          </Card>

          <Card title={<span className="flex items-center gap-2"><StatusIcon status="ok" className="h-4 w-4" />Backend</span>}>
            <dl className="divide-y divide-slate-100">
              <Row label="Status">Running</Row>
              <Row label="Running for">{fmtDuration(backendUptime)}</Row>
              <Row label="Started">{new Date(b.startedAt).toLocaleString()}</Row>
              <Row label="CPU"><span>{b.cpuPercent}%</span></Row>
              <Row label="Memory used">
                <div className="w-40 text-right">{b.memoryMb.rss} MB<Meter value={b.memoryMb.rss} max={1024} /></div>
              </Row>
              <Row label="Free system memory">{Math.round(memFree / 1024 * 10) / 10} of {Math.round(b.systemMemoryMb.total / 1024 * 10) / 10} GB</Row>
              <Row label="Runtime">Node {b.node} · pid {b.pid}</Row>
              <Row label="API protection">{b.apiProtected ? 'Token required' : <span className="text-amber-700">Off</span>}</Row>
            </dl>
          </Card>

          <Card title={<span className="flex items-center gap-2"><StatusIcon status={db.ok ? 'ok' : 'error'} className="h-4 w-4" />Database</span>}>
            <dl className="divide-y divide-slate-100">
              <Row label="Status">{db.ok ? 'Connected' : <span className="text-rose-700">Unreachable</span>}</Row>
              <Row label="Query time"><span className={latencyTone(db.latencyMs)}>{db.latencyMs === null ? '—' : `${db.latencyMs} ms`}</span></Row>
              {db.error && <Row label="Error"><span className="text-rose-700">{db.error}</span></Row>}
              <Row label="Last search">{data.lastSearch ? `${data.lastSearch.status.toLowerCase()} · ${data.lastSearch.jobsNew} new` : 'None yet'}</Row>
              <Row label="Analysis queue">{data.queue.running ? `Working (${data.queue.pending} waiting)` : data.queue.pending ? `${data.queue.pending} waiting` : 'Idle'}</Row>
            </dl>
          </Card>

          <Card title={<span className="flex items-center gap-2"><StatusIcon status={ai.ready ? 'ok' : 'error'} className="h-4 w-4" />AI model</span>}>
            <dl className="divide-y divide-slate-100">
              <Row label="Provider">{ai.provider}{ai.version ? ` ${ai.version}` : ''}</Row>
              <Row label="Model">{ai.model}</Row>
              <Row label="Status">{ai.ready ? 'Ready' : <span className="text-rose-700">Unavailable</span>}</Row>
              <Row label="Response time"><span className={latencyTone(ai.latencyMs)}>{ai.latencyMs === null ? '—' : `${ai.latencyMs} ms`}</span></Row>
              <Row label="In memory">
                {ai.loaded.length ? ai.loaded.map((m) => `${m.name} (${(m.sizeMb / 1024).toFixed(1)} GB)`).join(', ') : <span className="text-slate-500">Not loaded (loads on first use)</span>}
              </Row>
              <Row label="Email">{data.email.connected ? <Badge className="bg-emerald-100 text-emerald-800">{data.email.address}</Badge> : <Badge className="bg-amber-100 text-amber-800">{data.email.configured ? 'Not connected' : 'Not set up'}</Badge>}</Row>
            </dl>
          </Card>
        </div>
      </Item>

      <Item>
        <Card title="Checks and what to do">
          <ul className="-my-2 divide-y divide-slate-100">
            {[...data.checks].sort((a, b) => Number(a.status === 'ok') - Number(b.status === 'ok')).map((c) => (
              <li key={c.id} className="flex gap-3 py-3">
                <StatusIcon status={c.status} className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-900">{c.label}</p>
                  <p className="text-slate-600">{c.message}</p>
                  {c.fix && <p className="mt-0.5 text-slate-500">{c.fix}{c.href && <> <Link to={c.href} className="text-brand-600 hover:underline">Open</Link></>}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </Item>
    </Stagger>
  );
}
