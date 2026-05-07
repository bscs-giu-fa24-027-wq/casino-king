import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, setWallet } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', form);
      login(data.token, { ...data.user, vipTier: data.vipTier || null });
      setWallet(data.wallet || null);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8">
      <h1 className="mb-6 text-center text-2xl font-bold text-yellow-400">Login</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input aria-label="Email" name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" />
        <input aria-label="Password" name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" />
        <button disabled={loading} className="w-full rounded-lg bg-yellow-500 py-3 font-semibold text-gray-900 hover:bg-yellow-400 disabled:opacity-60">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-400">
        No account? <Link to="/register" className="text-yellow-400">Register</Link>
      </p>
    </div>
  );
}
