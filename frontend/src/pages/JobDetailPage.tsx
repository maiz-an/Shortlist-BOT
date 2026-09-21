import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEnsureApplication, useApplication, useGenerateDraft, useSetJobStatus } from '../features/applications/api';
import { EmailComposer } from '../features/applications/EmailComposer';
import { useDeleteJob, useJob, useReanalyze } from '../features/jobs/api';
import {
  Badge, Button, Card, Chips, Label, ScoreBar, ConfirmDialog, ErrorState, Loading, PageHeader, RecommendationBadge, StatusBadge, errMsg, fmtDate, useToast,
} from '../components/ui';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-0.5 text-sm text-slate-800">{children}</dd></div>;
}

function ApplicationSection({ appId }: { appId: string }) {
  const { data, isLoading, error, refetch } = useApplication(appId);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">Tracker: <Link className="text-brand-600 hover:underline" to={`/applications/${appId}`}>open application</Link></p>
      <EmailComposer app={data} />
    </div>
  );
}

export function JobDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: job, isLoading, error, refetch } = useJob(id);
  const ensure = useEnsureApplication();
  const gen = useGenerateDraft();
  const setStatus = useSetJobStatus();
  const reanalyze = useReanalyze();
  const del = useDeleteJob();
  const [confirm, setConfirm] = useState<'reject' | 'delete' | null>(null);

  if (isLoading) return <Loading />;
  if (error || !job) return <ErrorState error={error} onRetry={() => refetch()} />;
  const a = job.analysis;
  const app = job.application;
  const analyzing = job.status === 'NEW' || job.status === 'ANALYZING';

  const reviewApplication = () =>
    ensure.mutate(job.id, {
      onSuccess: (created) => gen.mutate(created.id, { onError: (e) => toast.error(errMsg(e)) }),
      onError: (e) => toast.error(errMsg(e)),
    });

  return (
    <div className="space-y-4">
      <p><Link to="/jobs" className="text-sm text-brand-600 hover:underline">← Jobs</Link></p>
      <PageHeader
        title={job.title}
        subtitle={`${job.company}${job.location ? ` · ${job.location}` : ''}`}
        actions={
          <>
            {job.jobUrl && <a href={job.jobUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center rounded-md border border-slate-300 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Open Job</a>}
            <Button loading={reanalyze.isPending} onClick={() => reanalyze.mutate(job.id, { onSuccess: () => toast.success('Re-analysis queued') })}>Re-analyze</Button>
            {job.status !== 'REJECTED' && <Button variant="danger" onClick={() => setConfirm('reject')}>Reject</Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <StatusBadge status={job.status} />
        {job.sourceListings.map((l) => <Badge key={l.id}>Found on {l.jobSource.name}</Badge>)}
        <span>Posted {fmtDate(job.postedAt)}</span>
        <span>· Collected {fmtDate(job.createdAt)}</span>
        {job.jobType && job.jobType !== 'UNKNOWN' && <Badge>{job.jobType.replace('_', ' ')}</Badge>}
      </div>

      {job.analysisError && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Analysis failed: {job.analysisError} <button className="ml-2 underline" onClick={() => reanalyze.mutate(job.id)}>Retry</button></div>
      )}
      {analyzing && !job.analysisError && <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-800">The local model is analyzing this job…</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="AI analysis" className="lg:col-span-2">
          {!a ? <p className="text-sm text-slate-500">Not analyzed yet.</p> : (
            <div className="space-y-4">
              <div>
                <Label>Match score</Label>
                <ScoreBar score={a.finalMatchScore} />
                <p className="mt-1.5 text-xs text-slate-500">Calculated from skills, title, experience, location, job type and CV fit. The AI suggested {a.aiMatchScore}%.</p>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <Fact label="Recommendation"><RecommendationBadge value={a.recommendation} /></Fact>
                <Fact label="Category">{a.category.replace('_', ' ')}</Fact>
                <Fact label="Recommended CV">{a.recommendedCv?.name ?? '—'}</Fact>
                <Fact label="Experience">{a.experienceRequired ?? 'Not stated'} · {a.experienceCompatible ? '✓ compatible' : '✗ may not fit'}</Fact>
                <Fact label="Location">{a.locationCompatible ? '✓ compatible' : '✗ mismatch'}</Fact>
                <Fact label="Salary">{a.salaryMentioned ? 'Mentioned' : 'Not mentioned'}</Fact>
              </dl>
              <div><Label>Matched skills</Label><Chips items={a.matchedSkills} tone="green" /></div>
              <div><Label>Missing skills</Label><Chips items={a.missingSkills} tone="red" /></div>
              {a.reason && <p className="text-sm text-slate-600">{a.reason}</p>}
              {a.rawAiResponse?.breakdown && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer">Score breakdown</summary>
                  <ul className="mt-1 space-y-0.5">{Object.entries(a.rawAiResponse.breakdown).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{v}</span></li>)}</ul>
                </details>
              )}
            </div>
          )}
        </Card>

        <Card title="Job description" className="lg:col-span-3">
          <p className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{job.description || 'No description was collected for this job. Open the job link to read it.'}</p>
          {job.applicationEmail && <p className="mt-3 text-sm text-slate-500">Application email: <span className="font-medium text-slate-800">{job.applicationEmail}</span></p>}
        </Card>
      </div>

      {app ? (
        <ApplicationSection appId={app.id} />
      ) : (
        <Card title="Application">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">{a ? 'Ready to review? This drafts an email using your recommended CV.' : 'Analyze the job first.'}</p>
            <Button variant="primary" disabled={!a} loading={ensure.isPending || gen.isPending} onClick={reviewApplication}>Review application</Button>
          </div>
        </Card>
      )}

      <div className="pt-2"><Button variant="ghost" onClick={() => setConfirm('delete')}>Delete job</Button></div>

      <ConfirmDialog
        open={confirm === 'reject'} title="Reject this job?" danger confirmLabel="Reject" loading={setStatus.isPending}
        message="It will be marked REJECTED and kept in your history."
        onClose={() => setConfirm(null)}
        onConfirm={() => setStatus.mutate({ jobId: job.id, status: 'REJECTED', note: 'Rejected from job page' }, { onSuccess: () => { setConfirm(null); toast.success('Job rejected'); }, onError: (e) => toast.error(errMsg(e)) })}
      />
      <ConfirmDialog
        open={confirm === 'delete'} title="Delete this job?" danger confirmLabel="Delete" loading={del.isPending}
        message="This permanently removes the job, its analysis and any application record."
        onClose={() => setConfirm(null)}
        onConfirm={() => del.mutate(job.id, { onSuccess: () => { toast.success('Job deleted'); nav('/jobs'); }, onError: (e) => toast.error(errMsg(e)) })}
      />
    </div>
  );
}
