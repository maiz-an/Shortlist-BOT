import { useRef, useState } from 'react';
import { useCvMutations, useCvs } from '../features/cvs/api';
import type { CvInput } from '../features/cvs/api';
import { apiClient } from '../services/api-client';
import type { CvProfile } from '../types';
import {
  Badge, Button, Card, Chips, ConfirmDialog, EmptyState, ErrorState, Field, Input, ListInput, Loading, Modal, PageHeader, Select, Textarea, Toggle, errMsg, useToast,
} from '../components/ui';

const CATEGORIES = ['FULL_STACK', 'FRONTEND', 'BACKEND', 'IT_SUPPORT', 'SYSADMIN', 'DEVOPS', 'DATA', 'OTHER_IT'];
const blank: CvInput = { name: '', description: '', category: 'FULL_STACK', enabled: true, skills: [], preferredJobKeywords: [], excludedKeywords: [] };

function CvForm({ initial, busy, onSave }: { initial: CvInput; busy: boolean; onSave: (v: CvInput) => void }) {
  const [v, setV] = useState(initial);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <Field label="Name"><Input required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category"><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Enabled"><Toggle checked={v.enabled} onChange={(enabled) => setV({ ...v, enabled })} label="Enabled" /></Field>
      </div>
      <Field label="Description"><Textarea rows={2} maxLength={500} value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <Field label="Skills" hint="Comma separated. Only skills listed here are ever claimed in emails."><ListInput value={v.skills} onChange={(skills) => setV({ ...v, skills })} placeholder="React, TypeScript, PostgreSQL" /></Field>
      <Field label="Preferred job keywords" hint="Job titles this CV is meant for."><ListInput value={v.preferredJobKeywords} onChange={(preferredJobKeywords) => setV({ ...v, preferredJobKeywords })} /></Field>
      <Field label="Excluded keywords" hint="Jobs containing these are never matched to this CV."><ListInput value={v.excludedKeywords} onChange={(excludedKeywords) => setV({ ...v, excludedKeywords })} /></Field>
      <Button type="submit" variant="primary" loading={busy}>Save CV profile</Button>
    </form>
  );
}

function CvCard({ cv, onEdit, onDelete, onPreview }: { cv: CvProfile; onEdit: () => void; onDelete: () => void; onPreview: () => void }) {
  const { upload, uploadSendPdf, update } = useCvMutations();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  return (
    <Card
      title={<span className="flex items-center gap-2">{cv.name}{!cv.enabled && <Badge>Disabled</Badge>}</span>}
      actions={<><Button onClick={onEdit}>Edit</Button><Button variant="ghost" onClick={onDelete}>Delete</Button></>}
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-500">{cv.description || 'No description'} · <span className="font-medium text-slate-700">{cv.category}</span></p>
        <div><p className="mb-1 text-xs font-medium text-slate-500">Skills</p><Chips items={cv.skills} /></div>
        <div><p className="mb-1 text-xs font-medium text-slate-500">Preferred keywords</p><Chips items={cv.preferredJobKeywords} /></div>
        {cv.excludedKeywords.length > 0 && <div><p className="mb-1 text-xs font-medium text-slate-500">Excluded</p><Chips items={cv.excludedKeywords} tone="red" /></div>}

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">CV file (for scoring and emails - PDF or DOCX, whichever reads better)</p>
          <div className="flex flex-wrap items-center gap-2">
            {cv.fileExists ? (
              <>
                <Badge className="bg-emerald-100 text-emerald-700">Uploaded</Badge>
                <a className="text-brand-600 hover:underline" href={apiClient.url(`/cv-profiles/${cv.id}/file`)} target="_blank" rel="noreferrer">{cv.originalFileName ?? 'View file'}</a>
              </>
            ) : <Badge className="bg-amber-100 text-amber-800">No file uploaded</Badge>}
            {cv.fileExists && (cv.textReadable
              ? <Badge className="bg-slate-100 text-slate-600">{cv.experienceYears != null ? `${cv.experienceYears} years read from CV` : 'Text read, no job dates found'}</Badge>
              : <Badge className="bg-amber-100 text-amber-800">Text could not be read - try re-uploading</Badge>)}
            <input
              ref={input} type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                upload.mutate({ id: cv.id, file }, { onSuccess: () => toast.success('CV file saved'), onError: (er) => toast.error(errMsg(er)) });
              }}
            />
            <Button loading={upload.isPending} onClick={() => input.current?.click()}>{cv.fileExists ? 'Replace file' : 'Upload file'}</Button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">PDF for sending (attached to application emails - upload your own, nicely formatted, PDF)</p>
          <div className="flex flex-wrap items-center gap-2">
            {cv.sendPdfReady
              ? <Badge className="bg-emerald-100 text-emerald-700">{cv.sendPdfOriginalFileName ?? 'Uploaded'}</Badge>
              : <Badge className="bg-amber-100 text-amber-800">Not uploaded - sending is blocked until you add one</Badge>}
            {cv.sendPdfReady && <Button onClick={onPreview}>Preview</Button>}
            <input
              ref={pdfInput} type="file" hidden accept=".pdf,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                uploadSendPdf.mutate({ id: cv.id, file }, { onSuccess: () => toast.success('PDF for sending saved'), onError: (er) => toast.error(errMsg(er)) });
              }}
            />
            <Button loading={uploadSendPdf.isPending} onClick={() => pdfInput.current?.click()}>{cv.sendPdfReady ? 'Replace PDF' : 'Upload PDF'}</Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{cv.enabled ? 'Enabled' : 'Disabled'}</span>
          <Toggle checked={cv.enabled} onChange={(enabled) => update.mutate({ id: cv.id, data: { enabled } })} label={`${cv.enabled ? 'Disable' : 'Enable'} ${cv.name}`} />
        </div>
        <p className="text-xs text-slate-400">Up to 5 MB each. The two files are independent - what you upload for sending is exactly what an employer gets. Stored locally, never in the database.</p>
      </div>
    </Card>
  );
}

export function CvsPage() {
  const { data, isLoading, error, refetch } = useCvs();
  const { create, update, remove } = useCvMutations();
  const toast = useToast();
  const [editing, setEditing] = useState<CvProfile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CvProfile | null>(null);
  const [previewing, setPreviewing] = useState<CvProfile | null>(null);

  const save = (v: CvInput) => {
    const opts = { onSuccess: () => { setEditing(null); toast.success('CV profile saved'); }, onError: (e: unknown) => toast.error(errMsg(e)) };
    if (editing === 'new') create.mutate(v, opts);
    else if (editing) update.mutate({ id: editing.id, data: v }, opts);
  };

  return (
    <div>
      <PageHeader title="CV profiles" subtitle="Each profile has its own file, skills and target roles. The best fit is chosen per job." actions={<Button variant="primary" onClick={() => setEditing('new')}>Add CV profile</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : !data?.length ? (
        <EmptyState title="No CV profiles" hint="Add one for each CV you use, then upload its file." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{data.map((cv) => <CvCard key={cv.id} cv={cv} onEdit={() => setEditing(cv)} onDelete={() => setDeleting(cv)} onPreview={() => setPreviewing(cv)} />)}</div>
      )}

      <Modal open={!!editing} title={editing === 'new' ? 'Add CV profile' : 'Edit CV profile'} onClose={() => setEditing(null)}>
        {editing && (
          <CvForm
            key={editing === 'new' ? 'new' : editing.id}
            busy={create.isPending || update.isPending}
            onSave={save}
            initial={editing === 'new' ? blank : { name: editing.name, description: editing.description ?? '', category: editing.category, enabled: editing.enabled, skills: editing.skills, preferredJobKeywords: editing.preferredJobKeywords, excludedKeywords: editing.excludedKeywords }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting} danger title="Delete CV profile?" confirmLabel="Delete" loading={remove.isPending} onClose={() => setDeleting(null)}
        message={`"${deleting?.name}" and its stored file will be removed. Existing applications keep their history.`}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { setDeleting(null); toast.success('Deleted'); }, onError: (e) => toast.error(errMsg(e)) })}
      />
      <Modal wide open={!!previewing} title={previewing ? `${previewing.name} - PDF preview` : 'PDF preview'} onClose={() => setPreviewing(null)}>
        {previewing && (
          <>
            <p className="mb-3 text-xs text-slate-500">This is exactly what gets attached when an application email is sent - not a download.</p>
            <iframe
              key={previewing.id}
              title={`${previewing.name} PDF preview`}
              src={apiClient.url(`/cv-profiles/${previewing.id}/email-preview`)}
              className="h-[75vh] w-full rounded-md border border-slate-200"
            />
          </>
        )}
      </Modal>
    </div>
  );
}
