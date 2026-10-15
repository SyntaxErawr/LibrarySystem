async function input(body, create = false, { student = false, existing, confirm = false } = {}) {
  const { accountErrors, courseSelection, text } = await import('../../shared/validation.mjs');
  const allowed = ['name', 'email', 'studentId', 'course', 'otherProgram', 'yearLevel', 'section'];
  for (const field of [...allowed, 'password', 'confirmPassword']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      throw Object.assign(new Error('Account fields must be text.'), { status: 400 });
    }
  }
  const studentEdit = student && (create || ['studentId', 'course', 'otherProgram', 'yearLevel'].some(field => body[field] !== undefined));
  const values = {
    ...(existing ? { ...existing.toObject(), ...courseSelection(existing.course) } : {}),
    ...body,
  };
  // Omitted passwords mean no change, regardless of a selected database hash.
  values.password = body.password;
  const errors = accountErrors(values, { student: studentEdit, passwordRequired: create, confirmRequired: confirm });
  if (body.section !== undefined && text(body.section).length > 50) errors.section = 'Section must be at most 50 characters.';
  if (Object.keys(errors).length) {
    throw Object.assign(new Error('Please check the highlighted fields.'), { status: 400, fields: errors });
  }
  const data = {};
  for (const field of allowed.filter(field => !['otherProgram', 'course'].includes(field))) {
    if (body[field] !== undefined) data[field] = text(body[field]);
  }
  if (data.email) data.email = data.email.toLowerCase();
  if (studentEdit) data.course = values.course === 'Other' ? text(values.otherProgram) : values.course;
  if (body.password !== undefined) data.password = body.password;
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw Object.assign(new Error('Active status must be true or false.'), { status: 400 });
    data.isActive = body.isActive;
  }
  return data;
}
module.exports = { input };
