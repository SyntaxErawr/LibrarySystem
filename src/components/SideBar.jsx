import { NavLink } from 'react-router';
import { useAuth } from '../context/AuthContext';
export default function SideBar() {
  const { user } = useAuth();
  return <aside className="sidebar"><div className="wordmark"><span className="brand-mark">B</span> By The Book</div><p className="small muted">A little space for big ideas.</p><nav aria-label="Main navigation"><NavLink to={`/${user.role}`} end>Overview</NavLink><NavLink to={`/${user.role}/books`}>{user.role === 'student' ? 'Book Catalog' : 'Book Inventory'}</NavLink><NavLink to={user.role === 'student' ? '/student/my-books' : `/${user.role}/borrowings`}>{user.role === 'student' ? 'My Books' : 'Borrowing & Returns'}</NavLink>{user.role !== 'student' && <NavLink to={`/${user.role}/users`}>{user.role === 'admin' ? 'Manage accounts' : 'Student accounts'}</NavLink>}</nav><p className="sidebar-note">Read. Discover. Grow.</p></aside>;
}
