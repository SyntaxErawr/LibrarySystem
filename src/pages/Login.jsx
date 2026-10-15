import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { emailChecks } from '../../shared/validation.mjs';
import { EmailField, PasswordField } from '../components/FormFields';
export default function Login() {
  const { user, login, sessionError } = useAuth();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = emailChecks(values.email).every(check => check.valid) && values.password.length > 0;
  if (user) return <Navigate to={`/${user.role}`} replace />;
  function change(event) {
    const { name, value } = event.target;
    setValues(previous => ({ ...previous, [name]: value }));
    setTouched(previous => ({ ...previous, [name]: true })); setError('');
  }
  function blur(event) { setTouched(previous => ({ ...previous, [event.target.name]: true })); }
  async function submit(event) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError('');
    try { await login(values.email, values.password); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-intro"><span className="eyebrow">YOUR SCHOOL LIBRARY</span><h1>A place to learn.<br />Room to grow.</h1><p>Books, ideas, and a little curiosity. Welcome to your library.</p><div className="book-art" aria-hidden="true"><span /><span /><span /><span /></div></section>
    <section className="login-card"><span className="brand-mark" aria-hidden="true">L</span><h2>Welcome back</h2><p className="muted">Sign in to your library account.</p>
      {location.state?.registrationSuccess && <p role="status" className="success">{location.state.registrationSuccess}</p>}
      <form onSubmit={submit} noValidate>
        <EmailField value={values.email} onChange={change} onBlur={blur} touched={touched.email} error={!emailChecks(values.email).every(check => check.valid) ? 'Enter a valid email address.' : ''} />
        <PasswordField value={values.password} onChange={change} onBlur={blur} touched={touched.password} error={!values.password ? 'Password is required.' : ''} autoComplete="current-password" />
        {(error || sessionError) && <p role="alert" className="error">{error || sessionError}</p>}
        <button type="submit" disabled={busy || !valid}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form><Link className="button secondary full-width" to="/register">Create Student Account</Link><p className="small muted account-help">Staff account? Contact your administrator.</p>
    </section>
  </main>;
}
