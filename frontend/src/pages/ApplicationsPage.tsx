import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApplications } from '../features/applications/api';
import { JOB_STATUSES } from '../types';
import type { JobStatus } from '../types';
import { EmptyState, ErrorState, Input, Loading, PageHeader, Pagination, ScoreBar, Select, StatusBadge, TableShell, Td, Th, fmtDate } from '../components/ui';

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
      <form className="mb-4 grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
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
            <TableShell>
              <thead><tr><Th>Company / Role</Th><Th>Match</Th><Th>CV</Th><Th>Source</Th><Th>Applied</Th><Th>Follow-up</Th><Th>Status</Th></tr></thead>
              <tbody>
                {data.items.map((a, idx) => (
                  <motion.tr key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 12) * 0.025, duration: 0.25 }} className="hover:bg-slate-50">
                    <Td>
                      <Link to={`/applications/${a.id}`} className="font-medium hover:text-brand-600">{a.jobTitle}</Link>
                      <p className="text-xs text-slate-500">{a.company}{a.location ? ` · ${a.location}` : ''}</p>
                    </Td>
                    <Td className="w-36"><ScoreBar score={a.matchScore} /></Td>
                    <Td className="text-slate-600">{a.selectedCv?.name ?? '—'}</Td>
                    <Td>{a.source ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(a.appliedDate)}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(a.followUpDate)}</Td>
                    <Td><StatusBadge status={a.status} /></Td>
                  </motion.tr>
                ))}
              </tbody>
            </TableShell>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p })} />
        </>
      )}
    </div>
  );
}
