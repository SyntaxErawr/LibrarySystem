import { Outlet } from 'react-router';
import SideBar from '../components/SideBar';
import NavBar from '../components/NavBar';
export default function DashboardLayout() {
  return <div className="app-shell"><SideBar /><div className="workspace"><NavBar /><main className="content"><Outlet /></main></div></div>;
}
