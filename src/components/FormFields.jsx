import { useState } from 'react';
import { emailChecks, passwordChecks, passwordBytes, PROGRAMS, YEAR_LEVELS } from '../../shared/validation.mjs';

export function Checklist({ checks, touched = false, id }) {
  return <ul id={id} className="requirements" aria-live="polite">{checks.map(check => <li key={check.label} className={touched ? check.valid ? 'valid' : 'invalid' : 'neutral'}><span aria-hidden="true">{touched ? check.valid ? '\u2713' : '\u2715' : '\u2022'}</span> {check.label}<span className="sr-only">{touched ? check.valid ? ': met' : ': not met' : ': not checked'}</span></li>)}</ul>;
}
export function TextField({ label, name, value, onChange, onBlur, touched, error, type = 'text', maxLength, autoComplete = 'off', required = true }) {
  const invalid = touched && !!error;
  return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} value={value} onChange={onChange} onBlur={onBlur} required={required} maxLength={maxLength} autoComplete={autoComplete} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${name}-error` : undefined} />{invalid && <p className="field-error" id={`${name}-error`}>{error}</p>}</div>;
}
export function EmailField({ value, onChange, onBlur, touched, error }) {
  return <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" value={value} onChange={onChange} onBlur={onBlur} required maxLength={254} autoComplete="username" aria-invalid={touched && !!error || undefined} aria-describedby="email-checks email-error" /><Checklist id="email-checks" touched={touched} checks={emailChecks(value)} /><p id="email-error" className="field-error">{touched && error}</p></div>;
}
export function PasswordField({ name = 'password', label = 'Password', value, password, onChange, onBlur, touched, error, complexity = false, required = true, autoComplete = 'new-password' }) {
  const [show, setShow] = useState(false);
  const checks = name === 'confirmPassword'
    ? [{ label: value && value === password ? 'Passwords match' : 'Passwords must match and cannot be empty', valid: !!value && value === password }]
    : complexity ? passwordChecks(value) : [{ label: 'Password is not empty', valid: value.length > 0 }];
  return <div className="field"><label htmlFor={name}>{label}</label><div className="password-input"><input id={name} name={name} type={show ? 'text' : 'password'} value={value} onChange={onChange} onBlur={onBlur} required={required} autoComplete={autoComplete} aria-invalid={touched && !!error || undefined} aria-describedby={`${required || value ? `${name}-checks ` : ''}${name}-error`} /><button type="button" className="password-toggle" onClick={() => setShow(previous => !previous)} aria-label={`${show ? 'Hide' : 'Show'} ${name === 'confirmPassword' ? 'confirm password' : 'password'}`} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button></div>{(required || value) && <Checklist id={`${name}-checks`} checks={checks} touched={touched} />}{complexity && <p className="small muted">Maximum 72 UTF-8 bytes.{passwordBytes(value) > 72 && ' Password is too long.'}</p>}<p id={`${name}-error`} className="field-error">{touched && error}</p></div>;
}
export function StudentFields({ values, onChange, onBlur, touched, errors }) {
  return <>
    <TextField label="School ID / Student number" name="studentId" value={values.studentId} onChange={onChange} onBlur={onBlur} touched={touched.studentId} error={errors.studentId} maxLength={50} />
    <div className="field"><label htmlFor="course">Course / Program</label><select id="course" name="course" value={values.course} onChange={onChange} onBlur={onBlur} required aria-invalid={touched.course && !!errors.course || undefined} aria-describedby="course-error"><option value="">Select your program</option>{PROGRAMS.map(program => <option key={program.value} value={program.value}>{program.label}</option>)}</select><p className="field-error" id="course-error">{touched.course && errors.course}</p></div>
    {values.course === 'Other' && <TextField label="Specify your program" name="otherProgram" value={values.otherProgram} onChange={onChange} onBlur={onBlur} touched={touched.otherProgram} error={errors.otherProgram} maxLength={100} />}
    <div className="field"><label htmlFor="yearLevel">Year level</label><select id="yearLevel" name="yearLevel" value={values.yearLevel} onChange={onChange} onBlur={onBlur} required aria-invalid={touched.yearLevel && !!errors.yearLevel || undefined} aria-describedby="yearLevel-error"><option value="">Select your year level</option>{YEAR_LEVELS.map(year => <option key={year}>{year}</option>)}</select><p className="field-error" id="yearLevel-error">{touched.yearLevel && errors.yearLevel}</p></div>
  </>;
}
