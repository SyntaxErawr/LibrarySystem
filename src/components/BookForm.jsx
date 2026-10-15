import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { BOOK_TEXT_FIELDS, bookErrors, MAX_COPIES } from '../../shared/bookValidation.mjs';
const empty = { title: '', author: '', isbn: '', category: '', totalCopies: '1', publisher: '', publicationYear: '', description: '', shelfLocation: '', coverImageUrl: '' };
export default function BookForm({ book, onClose, onSaved }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(() => Object.fromEntries(Object.keys(empty).map(key => [key, book?.[key] ?? empty[key]])));
  const [touched, setTouched] = useState({});
  const [serverFields, setServerFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = { ...bookErrors(values, { creating: !book }), ...serverFields };
  useEffect(() => { dialog.current.showModal(); }, []);
  function change(event) {
    const { name, value } = event.target;
    setValues(previous => ({ ...previous, [name]: value }));
    setTouched(previous => ({ ...previous, [name]: true })); setServerFields({}); setError('');
  }
  async function save(event) {
    event.preventDefault();
    if (busy || Object.keys(errors).length) return;
    setBusy(true); setError('');
    try {
      await api(book ? `/books/${book._id}` : '/books', { method: book ? 'PUT' : 'POST', body: JSON.stringify({ ...values, totalCopies: Number(values.totalCopies), ...(book ? { version: book.__v } : {}) }) });
      onSaved(book ? 'Book updated.' : 'Book added.');
    } catch (err) { setError(err.message); setServerFields(err.fields || {}); setTouched(Object.fromEntries(Object.keys(empty).map(key => [key, true]))); }
    finally { setBusy(false); }
  }
  function field(name, label, options = {}) {
    const invalid = touched[name] && errors[name];
    const common = { id: `book-${name}`, name, value: values[name], onChange: change, onBlur: () => setTouched(previous => ({ ...previous, [name]: true })), 'aria-invalid': !!invalid || undefined, 'aria-describedby': invalid ? `book-${name}-error` : undefined, ...options };
    return <div className="field" key={name}><label htmlFor={common.id}>{label}</label>{name === 'description' ? <textarea {...common} rows={3} /> : <input {...common} />} {invalid && <p className="field-error" id={`book-${name}-error`}>{errors[name]}</p>}</div>;
  }
  return <dialog ref={dialog} className="book-dialog" aria-labelledby="book-form-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><h2 id="book-form-title">{book ? 'Edit book' : 'Add book'}</h2><p className="muted">Required fields are marked *. Available copies are calculated by the library.</p><form onSubmit={save} noValidate><fieldset disabled={busy}><div className="book-form-grid">
    {field('title', 'Book title *', { required: true, maxLength: 200, autoFocus: true })}
    {field('author', 'Author *', { required: true, maxLength: 200 })}
    {field('isbn', 'ISBN *', { required: true, maxLength: 40 })}
    {field('category', 'Category / Genre *', { required: true, maxLength: 100 })}
    {field('totalCopies', 'Total copies *', { required: true, type: 'number', min: book ? 0 : 1, max: MAX_COPIES, step: 1 })}
    {field('publicationYear', 'Publication year', { type: 'number', min: 1, max: new Date().getFullYear() + 1, step: 1 })}
    {Object.entries(BOOK_TEXT_FIELDS).filter(([name]) => !['title', 'author', 'category'].includes(name)).map(([name, rule]) => field(name, rule.label, { maxLength: rule.max, ...(name === 'coverImageUrl' ? { type: 'url' } : {}) }))}
    </div>{error && <p role="alert" className="error">{error}</p>}<div className="actions"><button type="submit" disabled={busy || Object.keys(errors).length > 0}>{busy ? 'Saving...' : book ? 'Save changes' : 'Add book'}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div></fieldset></form></dialog>;
}
