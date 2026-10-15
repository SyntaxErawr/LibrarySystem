/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../services/api';
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  useEffect(() => {
    let active = true;
    const expire = () => setUser(null);
    window.addEventListener('library-session-expired', expire);
    async function restore() {
      try {
        if (tokenStore.get()) {
          const data = await api('/auth/me');
          if (active) setUser(data.user);
        }
      } catch (error) { if (active) setSessionError(error.message); }
      finally { if (active) setLoading(false); }
    }
    restore();
    return () => { active = false; window.removeEventListener('library-session-expired', expire); };
  }, []);
  async function login(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    tokenStore.set(data.token); setUser(data.user); setSessionError('');
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    tokenStore.clear(); setUser(null);
  }
  return <AuthContext.Provider value={{ user, loading, login, logout, sessionError }}>{children}</AuthContext.Provider>;
}
