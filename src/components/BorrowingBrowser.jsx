import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import BorrowForm from './BorrowForm';
import BorrowingTable from './BorrowingTable';
import RequestTable from './RequestTable';
import RequestActionDialog from './RequestActionDialog';
function ReturnDialog({ loan, onClose, onSaved }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  async function confirm() {
    setBusy(true); setError('');
    try { const result = await api(`/borrowings/${loan._id}/return`, { method: 'PATCH' }); onSaved(result.message); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="book-dialog" aria-labelledby="return-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><h2 id="return-title">Return this book?</h2><p>Confirm receipt of <strong>{loan.book?.title}</strong> from {loan.student?.name}. One copy will be added back to the inventory.</p>{error && <p role="alert" className="error">{error}</p>}<div className="actions"><button disabled={busy} onClick={confirm}>{busy ? 'Returning...' : 'Confirm return'}</button><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button></div></dialog>;
}
export default function BorrowingBrowser({ staff = false }) {
  const [filters, setFilters] = useState({ status: 'active', search: '', page: 1 });
  const [data, setData] = useState({ borrowings: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [issue, setIssue] = useState(false);
  const [returning, setReturning] = useState(null);
  const [requestAction, setRequestAction] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await api(`/borrowings${staff ? '' : '/my'}?${new URLSearchParams(filters)}`);
        if (active) { setData(result); if (filters.page > result.pages) setFilters(previous => ({ ...previous, page: result.pages })); }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    }, 200);
    const refresh = () => setReload(value => value + 1);
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, 60000);
    return () => { active = false; clearTimeout(timer); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [staff, filters, reload]);
  function filter(event) { const { name, value } = event.target; setFilters(previous => ({ ...previous, [name]: value, page: 1 })); }
  function changed(text) { setMessage(text); setIssue(false); setReturning(null); setRequestAction(null); setReload(value => value + 1); window.dispatchEvent(new Event('library-books-changed')); window.dispatchEvent(new Event('library-loans-changed')); }
  const requestRows = data.borrowings.filter(record => ['pending', 'rejected', 'cancelled'].includes(record.status));
  const loanRows = data.borrowings.filter(record => !['pending', 'rejected', 'cancelled'].includes(record.status));
  return <><div className="page-heading"><div><span className="eyebrow">{staff ? 'LIBRARY CIRCULATION' : 'YOUR READING JOURNEY'}</span><h1>{staff ? 'Borrowing & Returns' : 'My Books'}</h1></div>{staff && <button onClick={() => setIssue(true)}>Borrow Book</button>}</div><p className="muted">{staff ? 'Issue one copy at a time and process returns safely.' : 'View your current loans and borrowing history. Ask library staff to process returns.'} Due dates use Asia/Manila; books are overdue the following day.</p>
    <div className="actions request-tabs" aria-label="Borrowing sections">{[['pending', 'Pending Requests'], ['active', 'Currently Borrowed'], [staff ? '' : 'history', 'Borrowing History']].map(([status, label]) => <button key={label} className={filters.status === status ? '' : 'secondary'} aria-pressed={filters.status === status} onClick={() => setFilters(previous => ({ ...previous, status, page: 1 }))}>{label}</button>)}</div>
    <section className="panel"><div className="catalog-filters"><label>Search records<input name="search" type="search" value={filters.search} onChange={filter} placeholder={staff ? 'Student, School ID, title, or ISBN' : 'Title or ISBN'} maxLength={120} /></label><label>Status<select name="status" value={filters.status} onChange={filter}><option value="active">Currently borrowed</option><option value="">All history</option><option value="borrowed">Borrowed (not overdue)</option><option value="overdue">Overdue</option><option value="returned">Returned</option><option value="pending">Pending Requests</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option><option value="history">Returned / Rejected / Cancelled</option></select></label></div>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="success">{message}</p>}
    {loading ? <p role="status">Loading borrowing records...</p> : data.borrowings.length ? <>{requestRows.length > 0 && <RequestTable records={requestRows} staff={staff} onAction={(action, record) => setRequestAction({ action, record })} />}{loanRows.length > 0 && <BorrowingTable records={loanRows} staff={staff} onReturn={staff ? setReturning : undefined} />}</> : <div className="empty-state"><h2>{filters.status === 'returned' ? 'No returned books yet' : 'No borrowing records found'}</h2><p className="muted">{staff ? 'Issue a book or try another filter.' : filters.status === 'active' ? 'You have no current loans. Request a title from Book Catalog.' : 'Your borrowing history will appear here.'}</p></div>}
    <div className="pagination"><button className="secondary" disabled={loading || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button><span>Page {filters.page} of {data.pages}</span><button className="secondary" disabled={loading || filters.page >= data.pages} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button><button className="secondary" onClick={() => setReload(value => value + 1)}>Refresh</button></div></section>
    {requestAction && <RequestActionDialog {...requestAction} onClose={() => setRequestAction(null)} onSaved={changed} />}{issue && <BorrowForm onClose={() => setIssue(false)} onSaved={changed} />}{returning && <ReturnDialog loan={returning} onClose={() => setReturning(null)} onSaved={changed} />}
  </>;
}
