import { useEffect, useState } from 'react';
import { api } from '../services/api';
import BorrowingTable from './BorrowingTable';
import RequestTable from './RequestTable';
import { displayDate } from '../../shared/borrowingDates.mjs';
export default function LoanSummary({ student = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let latest = 0;
    async function refresh() {
      const request = ++latest;
      try { const result = await api('/borrowings/summary'); if (active && request === latest) { setData(result); setError(''); } }
      catch (err) { if (active && request === latest) setError(err.message); }
    }
    refresh();
    window.addEventListener('focus', refresh); window.addEventListener('library-loans-changed', refresh);
    const timer = setInterval(refresh, 60000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('library-loans-changed', refresh); };
  }, []);
  return <section className="loan-summary" aria-label="Borrowing summary">{error && <p role="alert" className="error">{error}</p>}<div className="stats-grid"><div className="panel stat"><span>Pending Requests</span><strong data-loan-stat="pending">{data ? data.pendingCount : '...'}</strong></div><div className="panel stat"><span>{student ? 'My Current Loans' : 'Currently Borrowed Copies'}</span><strong data-loan-stat="active">{data ? data.activeCount : '...'}</strong></div><div className="panel stat"><span>{student ? 'My Overdue Books' : 'Overdue Books'}</span><strong data-loan-stat="overdue">{data ? data.overdueCount : '...'}</strong></div></div>
    {student && <section className="panel summary-panel"><h2>Upcoming due dates</h2>{data ? data.upcoming.length ? <ul>{data.upcoming.map(loan => <li key={loan._id}>{loan.book?.title || 'Book unavailable'} - {displayDate(loan.dueDate || loan.dueAt)} <span className={`badge loan-${loan.displayStatus}`}>{loan.displayStatus}</span></li>)}</ul> : <p className="muted">No active loans or upcoming due dates.</p> : <p role="status">Loading due dates...</p>}</section>}
    <section className="panel summary-panel"><h2>{student ? 'Recent Borrowing History' : 'Recent Borrowing Transactions'}</h2>{data ? data.recent.length ? <>{data.recent.some(record => ['pending', 'rejected', 'cancelled'].includes(record.status)) && <RequestTable records={data.recent.filter(record => ['pending', 'rejected', 'cancelled'].includes(record.status))} staff={!student} />}{data.recent.some(record => !['pending', 'rejected', 'cancelled'].includes(record.status)) && <BorrowingTable records={data.recent.filter(record => !['pending', 'rejected', 'cancelled'].includes(record.status))} staff={!student} />}</> : <p className="muted">No borrowing history yet.</p> : <p role="status">Loading borrowing summary...</p>}</section>
  </section>;
}
