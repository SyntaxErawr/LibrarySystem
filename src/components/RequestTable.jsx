import { displayDate } from '../../shared/borrowingDates.mjs';
export default function RequestTable({ records, staff, onAction }) {
  return <div className="table-scroll"><table className="inventory-table"><thead><tr>{staff && <th>Student / School ID</th>}<th>Book / ISBN</th><th>Request date</th><th>Status</th><th>Details</th><th>Actions</th></tr></thead><tbody>{records.map(record => <tr key={record._id}>
    {staff && <td data-label="Student"><strong>{record.student?.name || 'Student unavailable'}</strong><br />{record.student?.studentId || 'No School ID'}</td>}
    <td data-label="Book"><div><strong>{record.book?.title || 'Book unavailable'}</strong><br />{record.book?.isbn}</div></td><td data-label="Requested">{displayDate(record.requestedAt)}</td><td data-label="Status"><span className={`badge loan-${record.status}`}>{record.status}</span></td>
    <td data-label="Details"><div>{record.rejectionReason ? <>{record.rejectionReason}<br /><span className="small muted">Rejected {displayDate(record.reviewedAt)}</span></> : record.cancelledAt ? `Cancelled ${displayDate(record.cancelledAt)}` : 'Waiting for staff approval; stock is not reserved.'}</div></td>
    <td data-label="Actions"><div className="actions">{record.status === 'pending' && onAction && (staff ? <><button className="secondary" onClick={() => onAction('approve', record)}>Approve and Issue</button><button className="secondary" onClick={() => onAction('reject', record)}>Reject</button></> : <button className="secondary" onClick={() => onAction('cancel', record)}>Cancel Request</button>)}</div></td>
  </tr>)}</tbody></table></div>;
}
