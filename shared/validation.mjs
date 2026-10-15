// Edit this list to change the program choices in all student forms and APIs.
export const PROGRAMS = [
  { value: 'BSIT', label: 'BS Information Technology (BSIT)' },
  { value: 'BSCS', label: 'BS Computer Science (BSCS)' },
  { value: 'BSBA', label: 'BS Business Administration (BSBA)' },
  { value: 'BSHM', label: 'BS Hospitality Management (BSHM)' },
  { value: 'Other', label: 'Other' },
];
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
export const text = value => typeof value === 'string' ? value.trim() : '';
export const passwordBytes = value => new TextEncoder().encode(typeof value === 'string' ? value : '').length;
export function emailChecks(value) {
  const email = text(value);
  return [
    { label: 'Email is not empty', valid: email.length > 0 },
    { label: 'Valid email format', valid: email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) },
  ];
}
export function passwordChecks(value) {
  const password = typeof value === 'string' ? value : '';
  return [
    { label: 'Password is not empty', valid: password.length > 0 },
    { label: 'At least 8 characters', valid: [...password].length >= 8 },
    { label: 'Contains an uppercase letter', valid: /[A-Z]/.test(password) },
    { label: 'Contains a lowercase letter', valid: /[a-z]/.test(password) },
    { label: 'Contains a number', valid: /[0-9]/.test(password) },
    { label: 'Contains a special character', valid: /[^\p{L}\p{N}\s]/u.test(password) },
    { label: 'Password is not only whitespace', valid: password.trim().length > 0 },
  ];
}
export const validEmail = value => emailChecks(value).every(check => check.valid);
export const validPassword = value => passwordChecks(value).every(check => check.valid) && passwordBytes(value) <= 72;
export function courseSelection(course) {
  return PROGRAMS.some(program => program.value === course && course !== 'Other')
    ? { course, otherProgram: '' } : { course: course ? 'Other' : '', otherProgram: course || '' };
}
export function accountErrors(values, { student = true, passwordRequired = true, confirmRequired = false } = {}) {
  const errors = {};
  if (!text(values.name)) errors.name = 'Full name is required.';
  else if (text(values.name).length > 100) errors.name = 'Use at most 100 characters for the name.';
  if (!validEmail(values.email)) errors.email = 'Enter a valid email address.';
  if (student) {
    if (!text(values.studentId)) errors.studentId = 'School ID is required.';
    else if (text(values.studentId).length > 50) errors.studentId = 'School ID must be at most 50 characters.';
    if (!PROGRAMS.some(program => program.value === values.course)) errors.course = 'Select a course / program.';
    if (values.course === 'Other' && !text(values.otherProgram)) errors.otherProgram = 'Enter your course / program.';
    else if (values.course === 'Other' && text(values.otherProgram).length > 100) errors.otherProgram = 'Use at most 100 characters for the program.';
    if (!YEAR_LEVELS.includes(values.yearLevel)) errors.yearLevel = 'Select a year level.';
  }
  if (passwordRequired || values.password !== undefined && values.password !== '') {
    if (!validPassword(values.password)) errors.password = 'Meet all password requirements (maximum 72 UTF-8 bytes).';
  }
  if (confirmRequired && (!values.confirmPassword || values.password !== values.confirmPassword)) {
    errors.confirmPassword = 'Passwords must match and cannot be empty.';
  }
  return errors;
}
