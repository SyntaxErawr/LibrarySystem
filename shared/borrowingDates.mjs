export const LIBRARY_TIME_ZONE = 'Asia/Manila';
export function dateKey(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: LIBRARY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(value, days) {
  if (!validDateKey(value)) return '';
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const dayStart = key => new Date(`${key}T00:00:00.000+08:00`);
export const dayEnd = key => new Date(`${key}T23:59:59.999+08:00`);
export function loanStatus(loan, now = new Date()) {
  if (['pending', 'rejected', 'cancelled'].includes(loan.status)) return loan.status;
  if (loan.returnedAt || loan.status === 'returned') return 'returned';
  const due = loan.dueDate || loan.dueAt ? dateKey(loan.dueDate || loan.dueAt) : '';
  return due && dateKey(now) > due ? 'overdue' : 'borrowed';
}
export function daysRemaining(loan, now = new Date()) {
  const due = loan.dueDate || loan.dueAt ? dateKey(loan.dueDate || loan.dueAt) : '';
  if (!due || !['borrowed', 'overdue'].includes(loanStatus(loan, now))) return null;
  return Math.round((new Date(`${due}T00:00:00Z`) - new Date(`${dateKey(now)}T00:00:00Z`)) / 86400000);
}
export function displayDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', { timeZone: LIBRARY_TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}
