export const tokenStore = {
  get: () => sessionStorage.getItem('library-token'),
  set: token => sessionStorage.setItem('library-token', token),
  clear: () => sessionStorage.removeItem('library-token'),
};
const origin = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '')).replace(/\/$/, '');
export async function api(path, options = {}) {
  if (!origin) throw new Error('The library API address is not configured. Contact the administrator.');
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`${origin}${path}`, { ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch { throw new Error('Cannot reach the library server. Check that the backend is running.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      tokenStore.clear(); window.dispatchEvent(new Event('library-session-expired'));
    }
    throw Object.assign(new Error(data.message || 'The request could not be completed.'), { fields: data.fields || {} });
  }
  return data;
}
