import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { dateKey, addDays, validDateKey } from '../../shared/borrowingDates.mjs';
export default function BorrowForm({ onClose, onSaved }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(() => ({ student: '', book: '', borrowedAt: dateKey(), dueDate: addDays(dateKey(), 7) }));
  const [search, setSearch] = useState({ student: '', book: '' });
  const [students, setStudents] = useState([]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const [people, catalog] = await Promise.all([api(`/borrowings/students?search=${encodeURIComponent(search.student)}`), api(`/books?availability=available&limit=50&search=${encodeURIComponent(search.book)}`)]);
        if (active) { setStudents(people.students); setBooks(catalog.books); }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  const student = students.find(item => item._id === values.student);
  const book = books.find(item => item._id === values.book);
  const datesValid = validDateKey(values.borrowedAt) && validDateKey(values.dueDate) && values.borrowedAt <= dateKey() && values.dueDate >= values.borrowedAt;
  function change(event) {
    const { name, value } = event.target;
    setValues(previous => ({ ...previous, [name]: value, ...(name === 'borrowedAt' ? { dueDate: addDays(value, 7) } : {}) }));
    setError('');
  }
  function find(event) {
    const { name, value } = event.target;
    setSearch(previous => ({ ...previous, [name]: value }));
    setValues(previous => ({ ...previous, [name]: '' }));
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || loading || !student || !book || !datesValid) return;
    setBusy(true); setError('');
    try { const result = await api('/borrowings', { method: 'POST', body: JSON.stringify(values) }); onSaved(result.message); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="book-dialog" aria-labelledby="borrow-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><h2 id="borrow-title">Borrow Book</h2><p className="muted">One copy per issue. Maximum 3 active books per student. Dates use Asia/Manila.</p><form onSubmit={submit}><fieldset disabled={busy}>
    <label>Search student<input name="student" type="search" value={search.student} onChange={find} placeholder="Name or School ID" maxLength={120} /></label>
    <label>Student<select name="student" value={values.student} onChange={change} required disabled={loading}><option value="">Choose an active student</option>{students.map(item => <option key={item._id} value={item._id}>{item.name} - {item.studentId || 'No School ID'}</option>)}</select></label>
    <label>School ID<input readOnly value={student?.studentId || ''} /></label>
    <label>Search book<input name="book" type="search" value={search.book} onChange={find} placeholder="Title, author, or ISBN" maxLength={120} /></label>
    <label>Book<select name="book" value={values.book} onChange={change} required disabled={loading}><option value="">Choose an available book</option>{books.map(item => <option key={item._id} value={item._id}>{item.title} - {item.availableCopies} available</option>)}</select></label>
    <label>ISBN<input readOnly value={book?.isbn || ''} /></label>
    {loading && <p role="status">Loading choices...</p>}<p className="small muted">Up to 50 matches per dropdown. Refine your search if needed.</p>
    <div className="book-form-grid"><label>Borrow date<input name="borrowedAt" type="date" value={values.borrowedAt} onChange={change} max={dateKey()} required /></label><label>Due date<input name="dueDate" type="date" value={values.dueDate} onChange={change} min={values.borrowedAt} required /></label></div>
    {!datesValid && <p className="field-error">Use valid dates; borrow date cannot be in the future and due date cannot precede it.</p>}{error && <p role="alert" className="error">{error}</p>}
    <div className="actions"><button type="submit" disabled={busy || loading || !student || !book || !datesValid}>{busy ? 'Issuing...' : 'Issue book'}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
  </fieldset></form></dialog>;
}
