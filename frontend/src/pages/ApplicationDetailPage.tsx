import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApplication, useSetStatus, useUpdateApplication } from '../features/applications/api';
import { EmailComposer } from '../features/applications/EmailComposer';
import { MANUAL_STATUSES } from '../types';
import type { JobStatus } from '../types';
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, ScoreBar, Select, StatusBadge, Textarea, errMsg, fmtDateTime, useToast } from '../components/ui';

const toInput = (s: string | null) => (s ? s.slice(0, 10) : '');

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const { data: app, isLoading, error, refetch } = useApplication(id);
  const setStatus = useSetStatus();
  const update = useUpdateApplication();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [follow, setFollow] = useState('');
  const [interview, setInterview] = useState('');
  const [next, setNext] = useState<JobStatus | ''>('');

  useEffect(() => {
    if (!app) return;
    setNotes(app.notes ?? '');
    setFollow(toInput(app.followUpDate));
    setInterview(toInput(app.interviewDate));
  }, [app?.id, app?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <Loading />;
  if (error || !app) return <ErrorState error={error} onRetry={() => refetch()} />;

  const saveTracker = () =>
    update.mutate(
      { id, data: { notes, followUpDate: follow ? new Date(follow).toISOString() : null, interviewDate: interview ? new Date(interview).toISOString() : null } },
      { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(errMsg(e)) },
    );

  const changeStatus = () =>
    next && setStatus.mutate({ id, status: next }, { onSuccess: () => { toast.success(`Status set to ${next}`); setNext(''); }, onError: (e) => toast.error(errMsg(e)) });

  return (
    <div className="space-y-4">
      <p><Link to="/applications" className="text-sm text-brand-600 hover:underline">← Applications</Link></p>
      <PageHeader title={app.jobTitle} subtitle={`${app.company}${app.location ? ` · ${app.location}` : ''}`} actions={<Link className="rounded-md border border-slate-300 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" to={`/jobs/${app.jobId}`}>View job</Link>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tracker" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status"><div className="flex items-center gap-2"><StatusBadge status={app.status} /></div></Field>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Field label="Change status"><Select value={next} onChange={(e) => setNext(e.target.value as JobStatus)}><option value="">Select…</option>{MANUAL_STATUSES.filter((s) => s !== app.status).map((s) => <option key={s}>{s}</option>)}</Select></Field></div>
              <Button disabled={!next} loading={setStatus.isPending} onClick={changeStatus}>Update</Button>
            </div>
            <Field label="Follow-up date"><Input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} /></Field>
            <Field label="Interview date"><Input type="date" value={interview} onChange={(e) => setInterview(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea rows={4} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Button variant="primary" loading={update.isPending} onClick={saveTracker}>Save tracker</Button></div>
          </div>
        </Card>

        <Card title="Summary">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">Match</dt><dd><ScoreBar score={app.matchScore} /></dd></div>
            <div><dt className="text-slate-500">Source</dt><dd>{app.source ?? '—'}</dd></div>
            <div><dt className="text-slate-500">CV</dt><dd>{app.selectedCv?.name ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Applied</dt><dd>{fmtDateTime(app.appliedDate)}</dd></div>
            <div><dt className="text-slate-500">Created / updated</dt><dd>{fmtDateTime(app.createdAt)} / {fmtDateTime(app.updatedAt)}</dd></div>
            {app.jobUrl && <div><dt className="text-slate-500">Job URL</dt><dd className="truncate"><a className="text-brand-600 hover:underline" href={app.jobUrl} target="_blank" rel="noreferrer noopener">{app.jobUrl}</a></dd></div>}
          </dl>
        </Card>
      </div>

      <EmailComposer app={app} />

      {app.emailMessages.length > 0 && (
        <Card title="Sent messages">
          <ul className="divide-y divide-slate-100 text-sm">
            {app.emailMessages.map((m) => (
              <li key={m.id} className="py-2"><p className="font-medium">{m.subject}</p><p className="text-slate-500">To {m.recipient} · {fmtDateTime(m.sentAt)} · {m.provider}{m.selectedCvPath ? ` · ${m.selectedCvPath}` : ''}{m.providerMessageId ? ` · id ${m.providerMessageId}` : ''}</p></li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Status history">
        <ol className="space-y-1.5 text-sm">
          {app.statusHistory.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2"><span className="w-40 text-slate-500">{fmtDateTime(h.changedAt)}</span>{h.fromStatus && <><StatusBadge status={h.fromStatus} /><span>→</span></>}<StatusBadge status={h.toStatus} />{h.note && <span className="text-slate-500">{h.note}</span>}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
