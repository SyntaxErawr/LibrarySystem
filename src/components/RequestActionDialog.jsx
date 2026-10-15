import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { addDays, dateKey, validDateKey } from '../../shared/borrowingDates.mjs';
const labels = { request: 'Request to Borrow', cancel: 'Cancel Request', approve: 'Approve and Issue', reject: 'Reject Request' };
export default function RequestActionDialog({ action, record, onClose, onSaved }) {
  const dialog = useRef(null);
  const [dueDate, setDueDate] = useState(() => addDays(dateKey(), 7));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  const valid = action === 'reject' ? reason.trim().length > 0 && reason.trim().length <= 300 : action === 'approve' ? validDateKey(dueDate) && dueDate >= dateKey() : true;
  async function submit(event) {
    event.preventDefault(); if (busy || !valid) return;
    setBusy(true); setError('');
    try {
      const response = await api(action === 'request' ? '/borrowings/requests' : `/borrowings/${record._id}/${action}`, { method: action === 'request' ? 'POST' : 'PATCH', body: JSON.stringify(action === 'request' ? { book: record._id } : action === 'approve' ? { dueDate } : action === 'reject' ? { reason } : {}) });
      onSaved(response.message);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="book-dialog" aria-labelledby="request-action-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><h2 id="request-action-title">{labels[action]}</h2><p><strong>{record.book?.title || record.title}</strong></p>
    {action === 'request' && <p>Send this request to library staff? It counts toward your three-book limit and does not reserve a copy. Visit the library for approval and physical handover.</p>}
    {action === 'approve' && <p>Confirm you are handing one physical copy to {record.student?.name}. Stock and eligibility will be checked again. The borrow date will be today in Asia/Manila.</p>}
    {action === 'cancel' && <p>Cancel this pending request? No stock will change.</p>}
    <form onSubmit={submit}><fieldset disabled={busy}>{action === 'approve' && <label>Due date<input name="requestDueDate" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} min={dateKey()} required /></label>}{action === 'reject' && <label>Rejection reason<textarea name="rejectionReason" value={reason} onChange={event => setReason(event.target.value)} maxLength={300} required rows={3} /></label>}{error && <p role="alert" className="error">{error}</p>}<div className="actions"><button type="submit" disabled={!valid || busy}>{busy ? 'Saving...' : labels[action]}</button><button type="button" className="secondary" onClick={onClose}>Close</button></div></fieldset></form></dialog>;
}
