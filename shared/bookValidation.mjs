export const BOOK_TEXT_FIELDS = {
  title: { label: 'Book title', max: 200, required: true },
  author: { label: 'Author', max: 200, required: true },
  category: { label: 'Category / Genre', max: 100, required: true },
  publisher: { label: 'Publisher', max: 200 },
  description: { label: 'Description', max: 3000 },
  shelfLocation: { label: 'Shelf location', max: 100 },
  coverImageUrl: { label: 'Book cover image URL', max: 2000 },
};
export const MAX_COPIES = 1000000;
export const normalizeIsbn = value => typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
export function validIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return [...isbn].reduce((sum, char, index) => sum + (char === 'X' ? 10 : Number(char)) * (10 - index), 0) % 11 === 0;
  }
  return /^97[89]\d{10}$/.test(isbn) && [...isbn].reduce((sum, char, index) => sum + Number(char) * (index % 2 ? 3 : 1), 0) % 10 === 0;
}
export function wholeNumber(value) {
  return (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value));
}
export function bookErrors(values, { creating = true } = {}) {
  const errors = {};
  for (const [field, rule] of Object.entries(BOOK_TEXT_FIELDS)) {
    const value = values[field];
    if (value !== undefined && typeof value !== 'string') errors[field] = `${rule.label} must be text.`;
    else if (rule.required && !value?.trim()) errors[field] = `${rule.label} is required.`;
    else if (value?.trim().length > rule.max) errors[field] = `Use at most ${rule.max} characters.`;
  }
  if (!validIsbn(values.isbn) || typeof values.isbn !== 'string' || values.isbn.length > 40) errors.isbn = 'Enter a valid ISBN-10 or ISBN-13, including its check digit.';
  if (!wholeNumber(values.totalCopies) || Number(values.totalCopies) < (creating ? 1 : 0) || Number(values.totalCopies) > MAX_COPIES) errors.totalCopies = `Enter a whole number from ${creating ? 1 : 0} to ${MAX_COPIES}.`;
  if (values.publicationYear !== undefined && values.publicationYear !== '' && values.publicationYear !== null && (!wholeNumber(values.publicationYear) || Number(values.publicationYear) < 1 || Number(values.publicationYear) > new Date().getFullYear() + 1)) errors.publicationYear = 'Enter a valid publication year (up to next year).';
  if (typeof values.coverImageUrl === 'string' && values.coverImageUrl.trim()) {
    try {
      const url = new URL(values.coverImageUrl.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { errors.coverImageUrl = 'Enter an HTTP or HTTPS image URL without embedded credentials.'; }
  }
  return errors;
}
