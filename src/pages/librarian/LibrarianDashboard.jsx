import DashboardWelcome from '../../components/DashboardWelcome';
import LoanSummary from '../../components/LoanSummary';
import InventoryStats from '../../components/InventoryStats';
export default function LibrarianDashboard() { return <><DashboardWelcome title="Your library workspace" description="Support your students and manage their library accounts." /><InventoryStats /><LoanSummary /></>; }
