import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import BookForm from './BookForm';
import RequestActionDialog from './RequestActionDialog';
function ConfirmArchive({ book, busy, onCancel, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="book-dialog" aria-labelledby="archive-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}><h2 id="archive-title">Archive this book?</h2><p><strong>{book.title}</strong> will leave the active catalog. Borrowing history will be kept.</p><div className="actions"><button disabled={busy} onClick={onConfirm}>{busy ? 'Archiving...' : 'Confirm archive'}</button><button className="secondary" disabled={busy} onClick={onCancel}>Cancel</button></div></dialog>;
}
function Details({ book, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="book-dialog" aria-labelledby="book-details-title" onCancel={event => { event.preventDefault(); onClose(); }}><h2 id="book-details-title">{book.title}</h2>{book.coverImageUrl && <img className="book-cover" src={book.coverImageUrl} alt={`Cover of ${book.title}`} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<dl className="profile-grid">{[['Author', book.author], ['ISBN', book.isbn], ['Category', book.category], ['Publisher', book.publisher], ['Publication year', book.publicationYear], ['Shelf', book.shelfLocation], ['Total copies', book.totalCopies], ['Available copies', book.availableCopies], ['Status', book.status || (book.availableCopies ? 'Available' : 'Unavailable')]].map(([label, value]) => <div className="detail-pair" key={label}><dt>{label}</dt><dd>{value === undefined || value === '' ? 'Not provided' : value}</dd></div>)}</dl>{book.description && <p className="book-description">{book.description}</p>}<button onClick={onClose}>Close</button></dialog>;
}
export default function BookBrowser({ manage = false, request = false }) {
  const [filters, setFilters] = useState({ search: '', category: '', availability: '', state: 'active', page: 1 });
  const [data, setData] = useState({ books: [], total: 0, pages: 1, categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null);
  const [details, setDetails] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [requestTarget, setRequestTarget] = useState(null);
  const [requests, setRequests] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await api(`/books?${new URLSearchParams(filters)}`);
        if (request) {
          const statuses = await api(`/borrowings/requests/status?books=${result.books.map(book => book._id).join(',')}`);
          if (active) setRequests(Object.fromEntries(statuses.requests.map(record => [record.book, record])));
        }
        if (active) { setData(result); if (filters.page > result.pages) setFilters(previous => ({ ...previous, page: result.pages })); }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    }, 200);
    const refresh = () => setReload(value => value + 1);
    window.addEventListener('library-loans-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('library-loans-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [filters, reload, request]);
  function filter(event) {
    const { name, value } = event.target;
    setFilters(previous => ({ ...previous, [name]: value, page: 1, ...(name === 'state' ? { category: '' } : {}) }));
  }
  function changed(text) { setMessage(text); setEditor(null); setReload(value => value + 1); window.dispatchEvent(new Event('library-books-changed')); }
  async function archive(book) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await api(`/books/${book._id}`, { method: 'DELETE' }); changed(result.message); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); setArchiveTarget(null); }
  }
  async function openDetails(book) {
    setError('');
    try { const result = await api(`/books/${book._id}`); setDetails(result.book); }
    catch (err) { setError(err.message); }
  }
  return <><div className="page-heading"><div><span className="eyebrow">{manage ? 'LIBRARY COLLECTION' : 'FIND YOUR NEXT READ'}</span><h1>{manage ? 'Book Inventory' : 'Book Catalog'}</h1></div>{manage && <button onClick={() => { setEditor({}); setMessage(''); }}>Add Book</button>}</div><p className="muted">{manage ? 'Keep your titles, shelves, and copies organized.' : 'Browse your library and see which books are available.'}</p>
    <section className="panel"><div className="catalog-filters"><label>Search books<input type="search" name="search" value={filters.search} onChange={filter} maxLength={120} placeholder="Title, author, or ISBN" /></label><label>Category<select name="category" value={filters.category} onChange={filter}><option value="">All categories</option>{data.categories.map(category => <option key={category}>{category}</option>)}</select></label><label>Availability<select name="availability" value={filters.availability} onChange={filter}><option value="">All copies</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>{manage && <label>Catalog<select name="state" value={filters.state} onChange={filter}><option value="active">Active books</option><option value="archived">Archived books</option></select></label>}</div>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="success">{message}</p>}
    {loading ? <p role="status">Loading books...</p> : data.books.length ? <><p className="small muted">{data.total} book titles found</p><div className="table-scroll"><table className="inventory-table"><thead><tr><th>Book title / Author</th><th>ISBN</th><th>Category</th><th>Total copies</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.books.map(book => <tr key={book._id}><td data-label="Book"><strong>{book.title}</strong><br /><span className="muted small">{book.author}</span></td><td data-label="ISBN">{book.isbn}</td><td data-label="Category">{book.category}</td><td data-label="Total copies">{book.totalCopies}</td><td data-label="Available copies">{book.availableCopies}</td><td data-label="Status"><span className={`badge ${book.availableCopies ? '' : 'unavailable'}`}>{book.availableCopies ? 'Available' : 'Unavailable'}</span></td><td data-label="Actions"><div className="actions"><button className="secondary" onClick={() => openDetails(book)}>Details</button>{request && <><button className="secondary" disabled={!book.availableCopies || ['pending', 'borrowed', 'overdue'].includes(requests[book._id]?.status)} onClick={() => setRequestTarget(book)}>Request to Borrow</button>{requests[book._id] && <span className={`badge loan-${requests[book._id].displayStatus}`}>{requests[book._id].displayStatus === 'pending' ? 'Request pending' : requests[book._id].displayStatus}</span>}</>}{manage && book.isActive && <><button className="secondary" onClick={() => setEditor(book)}>Edit</button><button className="secondary" disabled={busy} onClick={() => setArchiveTarget(book)}>Archive</button></>}</div></td></tr>)}</tbody></table></div></> : <div className="empty-state"><h2>No books found</h2><p className="muted">{filters.search || filters.category || filters.availability ? 'Try another search or clear your filters.' : manage ? 'Add a book to start your collection.' : 'Your library has no books to show yet.'}</p></div>}
    <div className="pagination"><button className="secondary" disabled={loading || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button><span>Page {filters.page} of {data.pages}</span><button className="secondary" disabled={loading || filters.page >= data.pages} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button><button className="secondary" onClick={() => setReload(value => value + 1)}>Refresh</button></div></section>
    {requestTarget && <RequestActionDialog action="request" record={requestTarget} onClose={() => setRequestTarget(null)} onSaved={text => { setRequestTarget(null); setMessage(text); setReload(value => value + 1); window.dispatchEvent(new Event('library-loans-changed')); }} />}{editor && <BookForm book={editor._id ? editor : null} onClose={() => setEditor(null)} onSaved={changed} />}{details && <Details book={details} onClose={() => setDetails(null)} />}{archiveTarget && <ConfirmArchive book={archiveTarget} busy={busy} onCancel={() => setArchiveTarget(null)} onConfirm={() => archive(archiveTarget)} />}
  </>;
}
