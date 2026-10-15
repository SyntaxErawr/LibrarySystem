import { useEffect, useState } from 'react';
import { api } from '../services/api';
export default function InventoryStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let latest = 0;
    async function refresh() {
      const request = ++latest;
      try { const result = await api('/books/stats'); if (active && request === latest) { setStats(result.stats); setError(''); } }
      catch (err) { if (active && request === latest) setError(err.message); }
    }
    refresh();
    window.addEventListener('focus', refresh); window.addEventListener('library-books-changed', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('library-books-changed', refresh); };
  }, []);
  return <section aria-label="Inventory statistics">{error && <p role="alert" className="error">{error}</p>}<div className="stats-grid">{[['Total Book Titles', 'totalTitles'], ['Total Physical Copies', 'totalCopies'], ['Available Copies', 'availableCopies'], ['Borrowed Copies', 'borrowedCopies']].map(([label, key]) => <div className="panel stat" key={key}><span>{label}</span><strong data-stat={key}>{stats ? stats[key].toLocaleString() : '...'}</strong></div>)}</div><p className="small muted">Active inventory only. Borrowed copies are total copies minus available copies.</p></section>;
}
