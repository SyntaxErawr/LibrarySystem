import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { accountErrors, courseSelection } from '../../../shared/validation.mjs';
import { TextField, EmailField, PasswordField, StudentFields } from '../../components/FormFields';

const empty = { name: '', email: '', role: 'student', password: '', studentId: '', course: '', otherProgram: '', yearLevel: '', section: '', isActive: true };
export default function ManageUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const errors = { ...accountErrors(form, { student: form.role === 'student', passwordRequired: !editing }), ...serverErrors };
  useEffect(() => {
    let active = true;
    api('/users').then(data => { if (active) setUsers(data.users); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  function change(event) {
    const { name, value, type, checked } = event.target;
    setForm(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
    setTouched(previous => ({ ...previous, [name]: true }));
    setServerErrors(previous => { const next = { ...previous }; delete next[name]; return next; });
    setError(''); setMessage('');
  }
  function blur(event) { setTouched(previous => ({ ...previous, [event.target.name]: true })); }
  function reset() { setEditing(null); setForm(empty); setTouched({}); setServerErrors({}); }
  function edit(account) {
    setEditing(account._id);
    setForm({ ...empty, ...account, ...courseSelection(account.course), password: '' });
    setTouched({}); setServerErrors({}); setError(''); setMessage('');
    document.getElementById('name')?.focus();
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || Object.keys(errors).length) return;
    setBusy(true); setError(''); setMessage('');
    const data = Object.fromEntries(Object.keys(empty).map(key => [key, form[key]]));
    if (form.role !== 'student') for (const key of ['studentId', 'course', 'otherProgram', 'yearLevel', 'section']) delete data[key];
    if (editing && !data.password) delete data.password;
    try {
      const result = await api(editing ? `/users/${editing}` : '/users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(data) });
      setUsers(previous => editing ? previous.map(item => item._id === editing ? result.user : item) : [...previous, result.user]);
      reset(); setMessage('Account saved.');
    } catch (err) {
      setError(err.message); setServerErrors(err.fields || {});
      setTouched(Object.fromEntries(Object.keys(empty).map(key => [key, true])));
    } finally { setBusy(false); }
  }
  const visible = users.filter(account => `${account.name} ${account.email} ${account.studentId || ''}`.toLowerCase().includes(search.toLowerCase()));
  const common = { onChange: change, onBlur: blur };
  return <><span className="eyebrow">PEOPLE & ACCESS</span><h1>{user.role === 'admin' ? 'Manage accounts' : 'Student accounts'}</h1><p className="muted">Create, update, or deactivate accounts. Account roles stay fixed after creation.</p>
    <div className="accounts-grid"><section className="panel"><h2>{editing ? 'Edit account' : 'New account'}</h2>
      <form onSubmit={submit} noValidate>
        <TextField label="Full name" name="name" value={form.name} touched={touched.name} error={errors.name} maxLength={100} {...common} />
        <EmailField value={form.email} touched={touched.email} error={errors.email} {...common} />
        <label>Role<select name="role" value={form.role} onChange={change} disabled={!!editing}><option value="student">Student</option>{user.role === 'admin' && <option value="librarian">Librarian</option>}</select></label>
        {form.role === 'student' && <><StudentFields values={form} touched={touched} errors={errors} {...common} /><TextField label="Section (optional)" name="section" value={form.section} required={false} maxLength={50} {...common} /></>}
        <PasswordField label={editing ? 'New password (leave empty to keep)' : 'Password'} value={form.password} touched={touched.password} error={errors.password} complexity required={!editing} {...common} />
        <label className="check"><input name="isActive" type="checkbox" checked={form.isActive} onChange={change} />Account active</label>
        {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <div className="actions"><button disabled={busy || Object.keys(errors).length > 0}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create account'}</button>{editing && <button type="button" className="secondary" disabled={busy} onClick={reset}>Cancel</button>}</div>
      </form></section>
      <section className="panel"><h2>Account directory</h2><label>Search accounts<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, email, or School ID" /></label>
        {loading ? <p role="status">Loading accounts...</p> : <><p className="small muted">{visible.length} accounts shown (up to 500)</p><div className="table-scroll"><table><thead><tr><th>Name / student details</th><th>Role / status</th><th>Action</th></tr></thead><tbody>{visible.map(account => <tr key={account._id}><td><strong>{account.name}</strong><br /><span className="small muted">{account.email}</span>{account.studentId && <><br /><span className="small">{account.studentId}</span></>}{account.course && <><br /><span className="small">{account.course} {account.yearLevel && ` / ${account.yearLevel}`}</span></>}</td><td>{account.role}<br /><span className="badge">{account.isActive ? 'Active' : 'Inactive'}</span></td><td><button className="secondary" disabled={busy} onClick={() => edit(account)}>Edit</button></td></tr>)}</tbody></table></div>{!visible.length && <p className="muted">No accounts to show.</p>}</>}
      </section></div>
  </>;
}
