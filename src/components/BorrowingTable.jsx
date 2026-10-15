import { displayDate } from '../../shared/borrowingDates.mjs';
export default function BorrowingTable({ records, staff = false, onReturn }) {
  return <div className="table-scroll"><table className="inventory-table borrowing-table"><thead><tr>{staff && <th>Student / School ID</th>}<th>Book / ISBN</th><th>Borrow date</th><th>Due date</th><th>Status</th><th>Return date / timing</th>{onReturn && <th>Action</th>}</tr></thead><tbody>{records.map(loan => <tr key={loan._id}>
    {staff && <td data-label="Student"><strong>{loan.student?.name || 'Student unavailable'}</strong><br /><span className="small muted">{loan.student?.studentId || 'No School ID'}</span></td>}
    <td data-label="Book"><div><strong>{loan.book?.title || 'Book unavailable'}</strong><br /><span className="small muted">{loan.book?.author}</span><br /><span className="small">{loan.book?.isbn}</span></div></td>
    <td data-label="Borrowed">{displayDate(loan.borrowedAt)}</td><td data-label="Due date">{displayDate(loan.dueDate || loan.dueAt)}</td>
    <td data-label="Status"><span className={`badge loan-${loan.displayStatus}`}>{loan.displayStatus}</span></td>
    <td data-label="Return / timing"><div>{loan.displayStatus === 'returned' ? displayDate(loan.returnedAt) : loan.daysRemaining === null ? 'Due date not recorded' : loan.daysRemaining < 0 ? `${-loan.daysRemaining} day(s) overdue` : loan.daysRemaining === 0 ? 'Due today' : `${loan.daysRemaining} day(s) remaining`}{staff && <><br /><span className="small muted">Issued: {loan.issuedBy?.name || 'Not recorded'}{loan.returnedBy?.name && ` / Returned: ${loan.returnedBy.name}`}</span></>}</div></td>
    {onReturn && <td data-label="Action">{['borrowed', 'overdue'].includes(loan.displayStatus) && <button className="secondary" onClick={() => onReturn(loan)}>Return Book</button>}</td>}
  </tr>)}</tbody></table></div>;
}
