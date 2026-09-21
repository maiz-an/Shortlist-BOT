import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Textarea, errMsg, useToast } from '../../components/ui';
import { useCreateManualJob } from './api';

const empty = { company: '', title: '', location: '', jobUrl: '', description: '', applicationEmail: '' };

/** Manual jobs go through the same ingest → analyze → score pipeline as collected jobs. */
export function ManualJobForm({ onDone }: { onDone?: () => void }) {
  const [f, setF] = useState(empty);
  const create = useCreateManualJob();
  const toast = useToast();
  const nav = useNavigate();
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) as typeof empty;
    create.mutate(clean, {
      onSuccess: (r) => {
        toast.success(r.created ? 'Job added. Analysis started.' : `Already have this job (duplicate by ${r.duplicateReason}).`);
        setF(empty);
        onDone?.();
        nav(`/jobs/${r.jobId}`);
      },
      onError: (err) => toast.error(errMsg(err)),
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Company *"><Input required maxLength={200} value={f.company} onChange={set('company')} /></Field>
      <Field label="Job title *"><Input required maxLength={300} value={f.title} onChange={set('title')} /></Field>
      <Field label="Location"><Input maxLength={200} value={f.location} onChange={set('location')} placeholder="Doha, Qatar" /></Field>
      <Field label="Application email"><Input type="email" value={f.applicationEmail} onChange={set('applicationEmail')} placeholder="hr@company.com" /></Field>
      <div className="sm:col-span-2"><Field label="Job URL"><Input type="url" value={f.jobUrl} onChange={set('jobUrl')} placeholder="https://…" /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Job description *"><Textarea required rows={9} maxLength={20000} value={f.description} onChange={set('description')} placeholder="Paste the full job description here" /></Field>
      </div>
      <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={create.isPending}>Analyze job</Button></div>
    </form>
  );
}
