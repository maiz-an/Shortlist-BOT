import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApplications } from '../features/applications/api';
import { JOB_STATUSES } from '../types';
import type { JobStatus } from '../types';
import { cx, EmptyState, ErrorState, Input, Loading, PageHeader, Pagination, ScoreBar, Select, StatusBadge, TableShell, Td, Th, fmtDate } from '../components/ui';

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const status = (params.get('status') as JobStatus | null) ?? '';
  const page = Number(params.get('page') ?? 1);
  const { data, isLoading, isFetching, error, refetch } = useApplications({ q: params.get('q') ?? '', status, page, pageSize: 20 });

  const update = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === '' ? next.delete(k) : next.set(k, String(v)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Applications" subtitle="Everything you are tracking, from review to offer." />
      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
        <div className="sm:col-span-2"><Input placeholder="Search company or title…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </form>

      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : !data || data.items.length === 0 ? (
        <EmptyState title="No applications yet" hint="Applications appear here once a job reaches review, or when you reject/track one." />
      ) : (
        <>
          <div className={isFetching ? 'opacity-70' : ''}>
            {/* Narrow screens: a stacked card per application, no side-scrolling. Wider screens: the full table. */}
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-card p-2 shadow-card lg:hidden">
              {data.items.map((a, idx) => {
                const due = a.status === 'APPLIED' && a.followUpDate && new Date(a.followUpDate).getTime() <= Date.now();
                return (
                  <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 12) * 0.025, duration: 0.25 }} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <Link to={`/applications/${a.id}`} className="block rounded-md p-2 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{a.jobTitle}</p>
                          <p className="truncate text-sm text-slate-600">{a.company}{a.location ? ` · ${a.location}` : ''}</p>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>
                      <div className="mt-2 min-w-28 max-w-40"><ScoreBar score={a.matchScore} /></div>
                      <p className="mt-2 truncate text-xs text-slate-500">
                        {a.selectedCv?.name ? `CV: ${a.selectedCv.name} · ` : ''}{a.source ?? '—'}{a.appliedDate ? ` · Applied ${fmtDate(a.appliedDate)}` : ''}
                      </p>
                      {a.followUpDate && <p className={cx('text-xs', due ? 'font-medium text-red-700' : 'text-slate-500')}>Follow-up {fmtDate(a.followUpDate)}{due ? ' · due' : ''}</p>}
                    </Link>
                  </motion.li>
                );
              })}
            </ul>

            <div className="hidden lg:block">
              <TableShell>
                <thead><tr><Th className="min-w-[13rem]">Company / Role</Th><Th className="min-w-[9rem]">Match</Th><Th className="min-w-[8rem]">CV</Th><Th className="min-w-[6rem]">Source</Th><Th className="min-w-[7rem]">Applied</Th><Th className="min-w-[8rem]">Follow-up</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {data.items.map((a, idx) => (
                    <motion.tr key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 12) * 0.025, duration: 0.25 }} className="hover:bg-slate-50">
                      <Td className="min-w-[13rem]">
                        <Link to={`/applications/${a.id}`} className="font-medium hover:text-brand-600">{a.jobTitle}</Link>
                        <p className="text-xs text-slate-500">{a.company}{a.location ? ` · ${a.location}` : ''}</p>
                      </Td>
                      <Td className="min-w-[9rem]"><ScoreBar score={a.matchScore} /></Td>
                      <Td className="min-w-[8rem] text-slate-600">{a.selectedCv?.name ?? '—'}</Td>
                      <Td className="min-w-[6rem]">{a.source ?? '—'}</Td>
                      <Td className="min-w-[7rem] whitespace-nowrap">{fmtDate(a.appliedDate)}</Td>
                      <Td className={`min-w-[8rem] whitespace-nowrap ${a.status === 'APPLIED' && a.followUpDate && new Date(a.followUpDate).getTime() <= Date.now() ? 'font-medium text-red-700' : ''}`}>
                        {fmtDate(a.followUpDate)}{a.status === 'APPLIED' && a.followUpDate && new Date(a.followUpDate).getTime() <= Date.now() ? ' · due' : ''}
                      </Td>
                      <Td><StatusBadge status={a.status} /></Td>
                    </motion.tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p })} />
        </>
      )}
    </div>
  );
}
