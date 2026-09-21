import { useEffect, useState } from 'react';
import { useCvs } from '../cvs/api';
import { apiClient } from '../../services/api-client';
import { Button, Card, ConfirmDialog, Field, Input, Select, Textarea, errMsg, fmtDateTime, useToast } from '../../components/ui';
import type { ApplicationDetail } from '../../types';
import { useGenerateDraft, useSaveDraft, useSendApplication, useUpdateApplication } from './api';

/** Review / edit / send flow for one application. Sending always goes through an explicit confirmation. */
export function EmailComposer({ app }: { app: ApplicationDetail }) {
  const draft = app.emailDraft;
  const [editing, setEditing] = useState(false);
  const [changingCv, setChangingCv] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({ recipient: '', subject: '', body: '' });
  const cvs = useCvs();
  const gen = useGenerateDraft();
  const save = useSaveDraft();
  const send = useSendApplication();
  const updateApp = useUpdateApplication();
  const toast = useToast();

  useEffect(() => {
    setForm({ recipient: draft?.recipient ?? app.job.applicationEmail ?? '', subject: draft?.subject ?? '', body: draft?.body ?? '' });
  }, [draft?.id, draft?.updatedAt, draft?.recipient, draft?.subject, draft?.body, app.job.applicationEmail]);

  const sent = app.status === 'APPLIED' || app.emailMessages.length > 0;
  const sending = app.status === 'SENDING';
  const cv = app.selectedCv;
  const cvMeta = cvs.data?.find((c) => c.id === cv?.id);
  const cvMissing = !cv || (cvMeta ? !cvMeta.fileExists : !cv.filePath);
  const canSend = !!draft && !sent && !sending && !!form.recipient && !cvMissing;

  const generate = () =>
    gen.mutate(app.id, {
      onSuccess: (r) => toast.success(r.generatedBy === 'template' ? 'Local model unavailable, so a plain template was used. Please review it.' : 'Email generated'),
      onError: (e) => toast.error(errMsg(e)),
    });

  const saveDraft = () =>
    save.mutate({ id: app.id, ...form }, { onSuccess: () => { setEditing(false); toast.success('Draft saved'); }, onError: (e) => toast.error(errMsg(e)) });

  const doSend = () =>
    send.mutate({ id: app.id, ...form }, {
      onSuccess: () => { setConfirming(false); toast.success('Application sent'); },
      onError: (e) => { setConfirming(false); toast.error(errMsg(e)); },
    });

  return (
    <Card
      title="Application email"
      actions={
        <>
          <Button loading={gen.isPending} disabled={sent || sending} onClick={generate}>{draft ? 'Regenerate' : 'Generate email'}</Button>
          {draft && !sent && <Button onClick={() => setEditing((e) => !e)}>{editing ? 'Cancel edit' : 'Edit Email'}</Button>}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Selected CV</p>
            {changingCv ? (
              <Select
                value={cv?.id ?? ''}
                onChange={(e) => updateApp.mutate({ id: app.id, data: { selectedCvId: e.target.value || null } }, { onSuccess: () => setChangingCv(false), onError: (er) => toast.error(errMsg(er)) })}
              >
                <option value="">— none —</option>
                {cvs.data?.filter((c) => c.enabled).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span>{cv?.name ?? 'None selected'}</span>
                {cv && <a className="text-brand-600 hover:underline" href={apiClient.url(`/cv-profiles/${cv.id}/file`)} target="_blank" rel="noreferrer">preview</a>}
                {!sent && <button className="text-brand-600 hover:underline" onClick={() => setChangingCv(true)}>Change CV</button>}
              </p>
            )}
            {cvMissing && !sent && <p className="mt-1 text-xs text-rose-600">{cv ? 'This CV has no uploaded file. Upload it on the CVs page.' : 'Choose a CV to attach.'}</p>}
          </div>
          <Field label="Recipient">
            <Input type="email" value={form.recipient} disabled={sent} placeholder="hr@company.com" onChange={(e) => setForm({ ...form, recipient: e.target.value })} onBlur={() => draft && !editing && form.recipient !== (draft.recipient ?? '') && save.mutate({ id: app.id, ...form })} />
          </Field>
        </div>

        {!draft ? (
          <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">No email yet. Click "Generate email" to draft one with the local model.</p>
        ) : editing ? (
          <div className="space-y-3">
            <Field label="Subject"><Input value={form.subject} maxLength={200} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label="Body"><Textarea rows={12} value={form.body} maxLength={6000} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            <Button variant="primary" loading={save.isPending} onClick={saveDraft}>Save draft</Button>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">{draft.subject}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{draft.body}</p>
          </div>
        )}

        {sent ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            Sent {app.emailMessages[0] ? `to ${app.emailMessages[0].recipient} on ${fmtDateTime(app.emailMessages[0].sentAt)}` : ''}.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!canSend || editing} loading={sending || send.isPending} onClick={() => setConfirming(true)}>Send application</Button>
            {editing && <span className="text-xs text-slate-500">Save your edits first.</span>}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Send this application?"
        confirmLabel="Send application"
        loading={send.isPending}
        onConfirm={doSend}
        onClose={() => setConfirming(false)}
        message={
          <dl className="space-y-2">
            <div><dt className="text-xs font-medium text-slate-500">To</dt><dd>{form.recipient}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Subject</dt><dd>{form.subject}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Attachment</dt><dd>{cv?.originalFileName ?? cv?.name ?? '—'}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Body</dt><dd className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{form.body}</dd></div>
            <p className="text-xs text-slate-500">This sends a real email from your connected Gmail account.</p>
          </dl>
        }
      />
    </Card>
  );
}
