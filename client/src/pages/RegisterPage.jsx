import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext.jsx';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralId = searchParams.get('ref') || '';
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    countryCode: '',
    dateOfBirth: '',
  });

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const query = referralId ? `?ref=${encodeURIComponent(referralId)}` : '';
      const { data } = await api.post(`/auth/register${query}`, form);
      login(data.token, data.user);
      toast.success('Account created');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8">
      <h1 className="mb-6 text-center text-2xl font-bold text-yellow-400">Register</h1>
      {referralId && <p className="mb-4 rounded-lg bg-gray-800 px-3 py-2 text-xs text-gray-300">Referral ID: {referralId}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input aria-label="Full name" name="fullName" type="text" placeholder="Full Name" value={form.fullName} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" />
        <input aria-label="Email" name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" />
        <input aria-label="Password" name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" />
        <div className="grid grid-cols-2 gap-4">
          <input aria-label="Country code" name="countryCode" type="text" placeholder="Country (ISO)" maxLength={2} value={form.countryCode} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 uppercase" />
          <input aria-label="Date of birth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3" />
        </div>
        <button disabled={loading} className="w-full rounded-lg bg-yellow-500 py-3 font-semibold text-gray-900 hover:bg-yellow-400 disabled:opacity-60">
          {loading ? 'Creating...' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-400">
        Already have an account? <Link to="/login" className="text-yellow-400">Login</Link>
      </p>
    </div>
  );
}
