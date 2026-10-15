import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
export default function DashboardWelcome({ title, description }) {
  const { user } = useAuth();
  return <><span className="eyebrow">{user.role} PORTAL</span><h1>{title}</h1><p className="muted">{description}</p><section className="panel welcome"><span className="badge">Account active</span><h2>Hello, {user.name}.</h2><p>You are signed in securely to your school library.</p>{user.role !== 'student' ? <Link className="button" to={`/${user.role}/users`}>{user.role === 'admin' ? 'Manage accounts' : 'Manage students'}</Link> : <><dl className="profile-grid"><dt>Email</dt><dd>{user.email}</dd><dt>School ID</dt><dd>{user.studentId || 'Not yet provided'}</dd><dt>Program</dt><dd>{user.course || 'Not yet provided'}</dd><dt>Year level</dt><dd>{user.yearLevel || 'Not yet provided'}</dd></dl><p className="muted">Browse the catalog and visit My Books for your loans and history.</p></>}</section></>;
}
