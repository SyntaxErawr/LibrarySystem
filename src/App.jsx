import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import DashboardLayout from './layouts/DashboardLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import LibrarianDashboard from './pages/librarian/LibrarianDashboard';
import StudentDashboard from './pages/student/StudentDashboard';
import ManageUsers from './pages/admin/ManageUsers';
import StudentRecords from './pages/librarian/StudentRecords';
import ManageBooks from './pages/admin/ManageBooks';
import BookCatalog from './pages/student/BookCatalog';
import BorrowingRecords from './pages/admin/BorrowingRecords';
import BorrowReturn from './pages/librarian/BorrowReturn';
import MyBooks from './pages/student/MyBooks';
function Protected({ role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role !== user.role) return <Navigate to={`/${user.role}`} replace />;
  return <Outlet />;
}
function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <main className="loading" role="status">Opening your library...</main>;
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route element={<Protected role="admin" />}><Route path="/admin" element={<DashboardLayout />}><Route index element={<AdminDashboard />} /><Route path="users" element={<ManageUsers />} /><Route path="books" element={<ManageBooks />} /><Route path="borrowings" element={<BorrowingRecords />} /></Route></Route>
    <Route element={<Protected role="librarian" />}><Route path="/librarian" element={<DashboardLayout />}><Route index element={<LibrarianDashboard />} /><Route path="users" element={<StudentRecords />} /><Route path="books" element={<ManageBooks />} /><Route path="borrowings" element={<BorrowReturn />} /></Route></Route>
    <Route element={<Protected role="student" />}><Route path="/student" element={<DashboardLayout />}><Route index element={<StudentDashboard />} /><Route path="books" element={<BookCatalog />} /><Route path="my-books" element={<MyBooks />} /></Route></Route>
    <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
  </Routes>;
}
export default function App() { return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>; }
