import byTheBookLogo from '../assets/auth/by-the-book-logo.png';
import './AuthPages.css';
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
  return <main className="login-page auth-page">
    <div className="auth-illustration" aria-hidden="true" />
    <section className="login-card"><img className="auth-logo" src={byTheBookLogo} alt="By the Book" /><h2 className="auth-heading">WELCOME</h2>
      {location.state?.registrationSuccess && <p role="status" className="success">{location.state.registrationSuccess}</p>}
      <form onSubmit={submit} noValidate>
        <EmailField value={values.email} onChange={change} onBlur={blur} touched={touched.email} error={!emailChecks(values.email).every(check => check.valid) ? 'Enter a valid email address.' : ''} />
        <PasswordField value={values.password} onChange={change} onBlur={blur} touched={touched.password} error={!values.password ? 'Password is required.' : ''} autoComplete="current-password" />
        {(error || sessionError) && <p role="alert" className="error">{error || sessionError}</p>}
        <button type="submit" disabled={busy || !valid}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form><p className="auth-switch">Don't have an account? <Link to="/register">Create Account</Link></p><p className="small muted account-help">Staff account? Contact your administrator.</p>
    </section>
  </main>;
}
