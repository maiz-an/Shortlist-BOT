import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEmailAccount, useEmailMessages, useEmailStatus } from '../features/settings/api';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, errMsg, fmtDateTime, useToast } from '../components/ui';

export function EmailPage() {
  const [params, setParams] = useSearchParams();
  const status = useEmailStatus();
  const messages = useEmailMessages();
  const { connect, disconnect } = useEmailAccount();
  const toast = useToast();

  useEffect(() => {
    if (params.get('connected')) toast.success('Gmail connected');
    if (params.get('error')) toast.error(`Gmail connection failed: ${params.get('error')}`);
    if (params.get('connected') || params.get('error')) setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => connect.mutate(undefined, { onSuccess: (r) => { window.location.href = r.url; }, onError: (e) => toast.error(errMsg(e)) });

  return (
    <div className="space-y-6">
      <PageHeader title="Email" subtitle="Applications are sent from your own Gmail account using OAuth. Your password is never requested or stored." />
      <Card title="Gmail">
        {status.isLoading ? <Loading /> : status.error ? <ErrorState error={status.error} onRetry={() => status.refetch()} /> : (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <Badge className={status.data?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{status.data?.connected ? 'Connected' : 'Not connected'}</Badge>
              {status.data?.email && <span className="font-medium">{status.data.email}</span>}
            </p>
            {!status.data?.configured && (
              <div className="rounded-md bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Gmail OAuth client not configured</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                  <li>In Google Cloud Console create an OAuth client (type: Web application) and enable the Gmail API.</li>
                  <li>Add redirect URI <code className="rounded bg-amber-100 px-1">http://localhost:4000/api/email/oauth/callback</code>.</li>
                  <li>Put the client ID and secret in <code className="rounded bg-amber-100 px-1">backend/.env</code> (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET) and restart the backend.</li>
                </ol>
              </div>
            )}
            <div className="flex gap-2">
              {status.data?.connected
                ? <Button loading={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.success('Disconnected'), onError: (e) => toast.error(errMsg(e)) })}>Disconnect</Button>
                : <Button variant="primary" disabled={!status.data?.configured} loading={connect.isPending} onClick={start}>Connect Gmail</Button>}
            </div>
          </div>
        )}
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Sent applications</h3>
        {messages.isLoading ? <Loading /> : messages.error ? <ErrorState error={messages.error} /> : !messages.data?.length ? (
          <EmptyState title="Nothing sent yet" hint="Sent applications are recorded here with recipient, subject, CV and provider message ID." />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-card text-sm shadow-sm">
            {messages.data.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="font-medium">{m.subject}</p>
                <p className="text-slate-500">To {m.recipient} · {fmtDateTime(m.sentAt)} · {m.provider}{m.selectedCvPath ? ` · ${m.selectedCvPath}` : ''}</p>
                {m.application && <Link className="text-brand-600 hover:underline" to={`/applications/${m.application.id}`}>{m.application.jobTitle} at {m.application.company}</Link>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
