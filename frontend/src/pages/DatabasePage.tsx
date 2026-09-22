import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, Copy, Download, RefreshCw, Search as SearchIcon, Table2 } from 'lucide-react';
import { exportUrl, fmtBytes, useDbOverview, useDbRow, useDbRows } from '../features/database/api';
import type { DbColumn, DbParams } from '../features/database/api';
import { Badge, Button, EmptyState, ErrorState, Input, Loading, Modal, Pagination, Select, cx, useToast } from '../components/ui';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Human-friendly rendering of one database value. */
function Cell({ value, column }: { value: unknown; column: DbColumn }) {
  if (value === null || value === undefined) return <span className="text-slate-400">null</span>;
  if (value === '[hidden]') return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">hidden</span>;
  if (typeof value === 'boolean') return <Badge className={value ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}>{value ? 'true' : 'false'}</Badge>;
  if (typeof value === 'number') return <span className="tabular-nums">{value}</span>;
  if (typeof value === 'string') {
    if (ISO.test(value) && column.type.startsWith('timestamp')) return <span className="whitespace-nowrap tabular-nums" title={value}>{new Date(value).toLocaleString()}</span>;
    if (column.name === 'id' || /Id$/.test(column.name)) return <span className="font-mono text-xs" title={value}>{value.length > 12 ? `${value.slice(0, 8)}…` : value}</span>;
    if (column.type.startsWith('enum')) return <Badge>{value}</Badge>;
    return <span className="block max-w-xs truncate" title={value}>{value}</span>;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? <span className="text-slate-400">[]</span> : (
      <span className="flex max-w-xs flex-wrap gap-1">{value.slice(0, 4).map((v, i) => <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{String(v)}</span>)}{value.length > 4 && <span className="text-xs text-slate-500">+{value.length - 4}</span>}</span>
    );
  }
  const json = JSON.stringify(value);
  return <span className="block max-w-xs truncate font-mono text-xs" title={json}>{json}</span>;
}

function RowModal({ table, id, onClose }: { table: string; id: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useDbRow(table, id);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error('Could not copy to the clipboard'); }
  };
  return (
    <Modal open={!!id} title={`${table} row`} onClose={onClose} footer={<Button onClick={copy} disabled={!data}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy as JSON'}</Button>}>
      {isLoading ? <Loading rows={3} /> : error || !data ? <ErrorState error={error} /> : (
        <dl className="divide-y divide-slate-100 text-sm">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-slate-500">{k}</dt>
              <dd className="min-w-0 sm:col-span-2">
                {v === null ? <span className="text-slate-400">null</span> : typeof v === 'object' ? (
                  <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(v, null, 2)}</pre>
                ) : <span className="whitespace-pre-wrap break-words">{String(v)}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}

export function DatabasePage() {
  const overview = useDbOverview();
  const [table, setTable] = useState<string | null>(null);
  const [tab, setTab] = useState<'data' | 'structure'>('data');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [params, setParams] = useState<Omit<DbParams, 'q'>>({ sort: '', order: 'desc', page: 1, pageSize: 25 });
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    if (!table && overview.data) setTable(overview.data.tables.find((t) => t.name === 'Job')?.name ?? overview.data.tables[0]?.name ?? null);
  }, [overview.data, table]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useDbRows(table, { ...params, q: search });
  const cols = rows.data?.columns ?? [];
  const hasId = cols.some((c) => c.name === 'id');
  const selected = useMemo(() => overview.data?.tables.find((t) => t.name === table), [overview.data, table]);

  const pick = (name: string) => {
    setTable(name);
    setQ('');
    setSearch('');
    setParams({ sort: '', order: 'desc', page: 1, pageSize: params.pageSize });
    setTab('data');
  };
  const sortBy = (c: string) =>
    setParams((p) => ({ ...p, sort: c, order: (rows.data?.sort ?? p.sort) === c && (rows.data?.order ?? p.order) === 'desc' ? 'asc' : 'desc', page: 1 }));

  if (overview.isLoading) return <Loading rows={4} />;
  if (overview.error || !overview.data) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const o = overview.data;

  return (
    // Fills the viewport under the app chrome; only the data grid scrolls, never the page.
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[26rem] flex-col gap-4 lg:h-[calc(100dvh-4.5rem)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-semibold text-slate-900">Database</h2>
          <p className="mt-1 truncate text-sm text-slate-600" title={o.version}>
            {o.version.replace('PostgreSQL ', 'PostgreSQL ')} · {fmtBytes(o.sizeBytes)} · {o.tables.length} tables · {o.totalRows.toLocaleString()} rows · read-only, secrets hidden
          </p>
        </div>
        <Button onClick={() => { void overview.refetch(); void rows.refetch(); }}>
          <RefreshCw className={cx('h-4 w-4', (overview.isFetching || rows.isFetching) && 'animate-spin')} />Refresh
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Table list */}
        <nav aria-label="Tables" className="min-h-0 lg:overflow-y-auto">
          <div className="lg:hidden">
            <Select value={table ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Table">
              {o.tables.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.rows})</option>)}
            </Select>
          </div>
          <ul className="hidden overflow-hidden rounded-lg border border-slate-200 bg-card lg:block">
            {o.tables.map((t) => (
              <li key={t.name}>
                <button onClick={() => pick(t.name)} className={cx('relative flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0', table === t.name ? 'font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50')}>
                  {table === t.name && <motion.span layoutId="db-table-active" className="absolute inset-0 bg-slate-100" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className="relative flex min-w-0 items-center gap-2"><Table2 className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} /><span className="truncate">{t.name}</span></span>
                  <span className="relative text-xs tabular-nums text-slate-500">{t.rows}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Table view */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div role="tablist" className="inline-flex rounded-md border border-slate-300 bg-card p-0.5 text-sm">
              {(['data', 'structure'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('rounded px-3 py-1 font-medium capitalize', tab === t ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900')}>{t}</button>
              ))}
            </div>
            <span className="text-sm text-slate-500">{selected ? `${selected.rows.toLocaleString()} ${selected.rows === 1 ? 'row' : 'rows'}` : ''}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {tab === 'data' && (
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input className="w-52 pl-8" placeholder="Search this table…" value={q} onChange={(e) => { setQ(e.target.value); setParams((p) => ({ ...p, page: 1 })); }} aria-label="Search rows" />
                </div>
              )}
              {table && <a className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" href={exportUrl(table, 'csv')}><Download className="h-4 w-4" />CSV</a>}
              {table && <a className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" href={exportUrl(table, 'json')}><Download className="h-4 w-4" />JSON</a>}
            </div>
          </div>

          {rows.isLoading ? <Loading rows={5} /> : rows.error || !rows.data ? <ErrorState error={rows.error} onRetry={() => rows.refetch()} /> : tab === 'structure' ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-card">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="sticky top-0 z-10"><tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500"><th className="px-4 py-2.5">Column</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Nullable</th><th className="px-4 py-2.5">Default</th></tr></thead>
                <tbody>
                  {cols.map((c) => (
                    <tr key={c.name} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{c.name}{c.name === 'id' && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">PK</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.type}</td>
                      <td className="px-4 py-2.5">{c.nullable ? 'yes' : 'no'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{c.default ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : rows.data.rows.length === 0 ? (
            <EmptyState title={search ? 'No rows match your search' : 'This table is empty'} hint={search ? 'Try a different word.' : 'Rows will appear here as the app stores data.'} />
          ) : (
            <>
              {/* Only this box scrolls. Column headers stay pinned while you move through the rows. */}
              <div className={cx('min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-card transition-opacity [scrollbar-gutter:stable]', rows.isFetching && 'opacity-70')}>
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {cols.map((c) => (
                        <th key={c.name} className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-500" aria-sort={rows.data.sort === c.name ? (rows.data.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button className="inline-flex items-center gap-1 hover:text-slate-900" onClick={() => sortBy(c.name)} title={`${c.type}${c.nullable ? ', nullable' : ''}`}>
                            {c.name}
                            {rows.data.sort === c.name && (rows.data.order === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.data.rows.map((r, i) => (
                      <tr
                        key={String(r.id ?? i)}
                        className={cx('border-b border-slate-100 last:border-b-0 hover:bg-slate-50', hasId && 'cursor-pointer')}
                        onClick={() => hasId && r.id != null && setOpenRow(String(r.id))}
                        tabIndex={hasId ? 0 : undefined}
                        onKeyDown={(e) => e.key === 'Enter' && hasId && r.id != null && setOpenRow(String(r.id))}
                      >
                        {cols.map((c) => <td key={c.name} className="px-3 py-2 align-top"><Cell value={r[c.name]} column={c} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 [&>div]:pt-0">
                <Pagination page={rows.data.page} pageSize={rows.data.pageSize} total={rows.data.total} onPage={(p) => setParams((s) => ({ ...s, page: p }))} />
                <label className="flex items-center gap-2 text-sm text-slate-600">Rows per page
                  <Select className="!w-20" value={params.pageSize} onChange={(e) => setParams((s) => ({ ...s, pageSize: Number(e.target.value), page: 1 }))}>{[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</Select>
                </label>
              </div>
            </>
          )}
        </section>
      </div>

      {table && <RowModal table={table} id={openRow} onClose={() => setOpenRow(null)} />}
    </div>
  );
}
