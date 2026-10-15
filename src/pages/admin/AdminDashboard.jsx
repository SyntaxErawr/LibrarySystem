import DashboardWelcome from '../../components/DashboardWelcome';
import LoanSummary from '../../components/LoanSummary';
import InventoryStats from '../../components/InventoryStats';
export default function AdminDashboard() { return <><DashboardWelcome title="Library overview" description="A calm place to keep your library organized." /><InventoryStats /><LoanSummary /></>; }
