import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
export default function NavBar() {
  const { user, logout } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function leave() {
    setBusy(true); setError('');
    try { await logout(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <header className="topbar"><div><span className="eyebrow">LIBRARY MANAGEMENT</span><p>{user.name} <span className="badge">{user.role}</span></p></div><div>{error && <p role="alert" className="error">{error}</p>}<button className="secondary" onClick={leave} disabled={busy}>{busy ? 'Signing out...' : 'Sign out'}</button></div></header>;
}
