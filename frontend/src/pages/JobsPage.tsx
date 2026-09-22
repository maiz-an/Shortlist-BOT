import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAnalyzePending, useJobs, useQueue } from '../features/jobs/api';
import type { JobFilters } from '../features/jobs/api';
import { ManualJobForm } from '../features/jobs/ManualJobForm';
import { JOB_STATUSES } from '../types';
import type { JobStatus } from '../types';
import {
  Badge, Button, EmptyState, ErrorState, Input, Loading, Modal, Notice, PageHeader, Pagination, RecommendationBadge, ScoreBar, Select,
  StatusBadge, TableShell, Td, Th, errMsg, fmtDate, useToast,
} from '../components/ui';

export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');
  const filters: JobFilters = {
    q: params.get('q') ?? '',
    status: (params.get('status') as JobStatus | null) ?? '',
    minScore: params.get('minScore') ? Number(params.get('minScore')) : '',
    recommendation: params.get('recommendation') ?? '',
    sort: params.get('sort') ?? 'matchScore',
    order: (params.get('order') as 'asc' | 'desc' | null) ?? 'desc',
    page: Number(params.get('page') ?? 1),
    pageSize: 20,
  };
  const { data, isLoading, isFetching, error, refetch } = useJobs(filters);
  const queue = useQueue();
  const analyzePending = useAnalyzePending();
  const toast = useToast();

  const update = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === undefined || v === '' ? next.delete(k) : next.set(k, String(v)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Every collected or pasted job, deduplicated across sources."
        actions={<Button variant="primary" onClick={() => setAdding(true)}>Add job manually</Button>}
      />

      {queue.data && (queue.data.running || queue.data.pending > 0) && (
        <Notice>Analyzing with the local model… {queue.data.pending} waiting.</Notice>
      )}
      {queue.data?.lastError && (
        <Notice tone="warn" action={<Button loading={analyzePending.isPending} onClick={() => analyzePending.mutate(undefined, { onSuccess: (r) => toast.success(`${r.queued} job(s) queued`), onError: (e) => toast.error(errMsg(e)) })}>
            Retry unanalyzed jobs
          </Button>}>Last analysis problem: {queue.data.lastError}</Notice>
      )}

      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <div className="lg:col-span-2"><Input placeholder="Search title, company, location…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={String(filters.minScore)} onChange={(e) => update({ minScore: e.target.value })} aria-label="Minimum score">
          <option value="">Any score</option>
          {[50, 70, 80, 90].map((s) => <option key={s} value={s}>{s}%+</option>)}
        </Select>
        <Select value={filters.recommendation} onChange={(e) => update({ recommendation: e.target.value })} aria-label="Recommendation">
          <option value="">Recommendation</option>
          {['APPLY', 'MAYBE', 'SKIP'].map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
          <option value="createdAt">Newest</option>
          <option value="postedAt">Posted date</option>
          <option value="matchScore">Match score</option>
        </Select>
      </form>

      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : !data || data.items.length === 0 ? (
        <EmptyState title="No jobs match" hint="Run a search from the dashboard, or paste a job manually." action={<Button variant="primary" onClick={() => setAdding(true)}>Add job manually</Button>} />
      ) : (
        <>
          <div className={isFetching ? 'opacity-70 transition' : 'transition'}>
            {/* Narrow screens: a stacked card per job, no side-scrolling. Wider screens: the full table. */}
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-card p-2 shadow-card lg:hidden">
              {data.items.map((j, idx) => (
                <motion.li key={j.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 12) * 0.025, duration: 0.25 }} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <Link to={`/jobs/${j.id}`} className="block rounded-md p-2 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{j.title}</p>
                        <p className="truncate text-sm text-slate-600">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
                      </div>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {j.analysis ? <div className="min-w-28 flex-1"><ScoreBar score={j.analysis.finalMatchScore} /></div> : <Badge>Not analyzed</Badge>}
                      {j.analysis && <RecommendationBadge value={j.analysis.recommendation} />}
                    </div>
                    <p className="mt-2 truncate text-xs text-slate-500">
                      {j.analysis?.recommendedCv ? `CV: ${j.analysis.recommendedCv.name} · ` : ''}
                      {[...new Set(j.sourceListings.map((s) => s.jobSource.name))].join(', ') || '—'} · {fmtDate(j.postedAt ?? j.createdAt)}
                    </p>
                  </Link>
                </motion.li>
              ))}
            </ul>

            <div className="hidden lg:block">
              <TableShell>
                <thead><tr><Th className="min-w-[13rem]">Job</Th><Th className="min-w-[11rem]">Match</Th><Th className="min-w-[9rem]">Recommended CV</Th><Th className="min-w-[7rem]">Source</Th><Th>Posted</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {data.items.map((j, idx) => (
                    <motion.tr key={j.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 12) * 0.025, duration: 0.25 }} className="hover:bg-slate-50">
                      <Td className="min-w-[13rem]">
                        <Link to={`/jobs/${j.id}`} className="font-medium text-slate-900 hover:text-brand-600">{j.title}</Link>
                        <p className="text-xs text-slate-500">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
                      </Td>
                      <Td className="min-w-[11rem]">
                        {j.analysis ? <div className="space-y-1"><ScoreBar score={j.analysis.finalMatchScore} /><RecommendationBadge value={j.analysis.recommendation} /></div> : <Badge>Not analyzed</Badge>}
                      </Td>
                      <Td className="min-w-[9rem] text-slate-600">{j.analysis?.recommendedCv?.name ?? '—'}</Td>
                      <Td className="min-w-[7rem]">{[...new Set(j.sourceListings.map((s) => s.jobSource.name))].join(', ')}</Td>
                      <Td className="whitespace-nowrap text-slate-500">{fmtDate(j.postedAt ?? j.createdAt)}</Td>
                      <Td><StatusBadge status={j.status} /></Td>
                    </motion.tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p })} />
        </>
      )}

      <Modal open={adding} title="Add job manually" onClose={() => setAdding(false)}>
        <ManualJobForm onDone={() => setAdding(false)} />
      </Modal>
    </div>
  );
}
