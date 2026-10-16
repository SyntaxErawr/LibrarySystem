import byTheBookLogo from '../assets/auth/by-the-book-logo.png';
import './AuthPages.css';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { accountErrors } from '../../shared/validation.mjs';
import { TextField, EmailField, PasswordField, StudentFields } from '../components/FormFields';

const empty = { studentId: '', name: '', email: '', course: '', otherProgram: '', yearLevel: '', password: '', confirmPassword: '' };
export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(empty);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = { ...accountErrors(values, { confirmRequired: true }), ...serverErrors };
  if (user) return <Navigate to={`/${user.role}`} replace />;
  function change(event) {
    const { name, value } = event.target;
    setValues(previous => ({ ...previous, [name]: value }));
    setTouched(previous => ({ ...previous, [name]: true }));
    setServerErrors(previous => { const next = { ...previous }; delete next[name]; return next; });
    setError('');
  }
  function blur(event) { setTouched(previous => ({ ...previous, [event.target.name]: true })); }
  async function submit(event) {
    event.preventDefault();
    if (busy || Object.keys(errors).length) return;
    setBusy(true); setError('');
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify(values) });
      navigate('/login', { replace: true, state: { registrationSuccess: 'Student account created. You can now log in.' } });
    } catch (err) {
      setError(err.message); setServerErrors(err.fields || {});
      setTouched(Object.fromEntries(Object.keys(values).map(key => [key, true])));
    } finally { setBusy(false); }
  }
  const common = { onChange: change, onBlur: blur };
  return <main className="login-page registration-page auth-page"><div className="auth-illustration" aria-hidden="true" /><section className="login-card"><img className="auth-logo" src={byTheBookLogo} alt="By The Book" /><h2 className="auth-heading">CREATE ACCOUNT</h2><form onSubmit={submit} noValidate>
    <TextField label="Full name" name="name" value={values.name} touched={touched.name} error={errors.name} maxLength={100} autoComplete="name" {...common} />
    <EmailField value={values.email} touched={touched.email} error={errors.email} {...common} />
    <StudentFields values={values} touched={touched} errors={errors} {...common} />
    <PasswordField value={values.password} touched={touched.password} error={errors.password} complexity {...common} />
    <PasswordField name="confirmPassword" label="Confirm password" value={values.confirmPassword} password={values.password} touched={touched.confirmPassword || touched.password && !!values.confirmPassword} error={errors.confirmPassword} {...common} />
    {error && <p role="alert" className="error">{error}</p>}<button type="submit" disabled={busy || Object.keys(errors).length > 0}>{busy ? 'Creating account...' : 'Create Account'}</button>
  </form><p className="auth-switch">Already have an account? <Link to="/login">Sign In</Link></p></section></main>;
}
