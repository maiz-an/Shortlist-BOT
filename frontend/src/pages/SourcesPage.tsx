import { useSourceMutations, useSources } from '../features/search/api';
import { Badge, ErrorState, Input, Loading, PageHeader, TableShell, Td, Th, Toggle, errMsg, useToast } from '../components/ui';

export function SourcesPage() {
  const { data, isLoading, error, refetch } = useSources();
  const update = useSourceMutations();
  const toast = useToast();
  const patch = (id: string, d: { enabled?: boolean; rateLimitMs?: number }) =>
    update.mutate({ id, data: d }, { onSuccess: () => toast.success('Source updated'), onError: (e) => toast.error(errMsg(e)) });

  return (
    <div>
      <PageHeader title="Job sources" subtitle="Sources are plug-ins. Only public listings are read; collection is rate limited and never bypasses CAPTCHAs or logins." />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : (
        <TableShell>
          <thead><tr><Th>Source</Th><Th>Status</Th><Th>Delay between requests (ms)</Th><Th>Jobs found</Th><Th> </Th></tr></thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.name}</Td>
                <Td>{s.implemented ? <Badge className={s.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{s.enabled ? 'Enabled' : 'Disabled'}</Badge> : <Badge className="bg-slate-100 text-slate-500">Not implemented yet</Badge>}</Td>
                <Td className="w-56">
                  <Input type="number" min={1000} max={60000} step={500} defaultValue={s.rateLimitMs} disabled={!s.implemented} onBlur={(e) => Number(e.target.value) !== s.rateLimitMs && patch(s.id, { rateLimitMs: Number(e.target.value) })} />
                </Td>
                <Td>{s.listingCount}</Td>
                <Td className="text-right">{s.implemented && <Toggle checked={s.enabled} onChange={(enabled) => patch(s.id, { enabled })} label={`${s.enabled ? 'Disable' : 'Enable'} ${s.name}`} />}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
