import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext.jsx';

const getErrorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || fallback;

const KYC_BADGE = {
  APPROVED: 'bg-emerald-500/20 text-emerald-300',
  SUBMITTED: 'bg-yellow-500/20 text-yellow-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  PENDING: 'bg-gray-500/20 text-gray-300',
};

const formatNumber = (value) => Number(value || 0).toLocaleString();

export default function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kycStatus, setKycStatus] = useState(user?.kycStatus || 'PENDING');
  const [vipStatus, setVipStatus] = useState(null);
  const [referralLink, setReferralLink] = useState('');
  const [referralStats, setReferralStats] = useState({ referrals: [], totalCkcEarned: 0 });
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  const memberSince = useMemo(() => {
    if (!user?.createdAt) return '—';
    return new Date(user.createdAt).toLocaleDateString();
  }, [user?.createdAt]);

  useEffect(() => {
    let mounted = true;

    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const [kycResult, vipResult, referralLinkResult, referralStatsResult] = await Promise.allSettled([
          api.get('/kyc/status'),
          api.get('/vip/status'),
          api.post('/referrals/generate'),
          api.get('/referrals/stats'),
        ]);

        if (!mounted) return;

        if (kycResult.status === 'fulfilled') {
          setKycStatus(kycResult.value.data?.kycStatus || 'PENDING');
        }

        if (vipResult.status === 'fulfilled') {
          setVipStatus(vipResult.value.data || null);
        }

        if (referralLinkResult.status === 'fulfilled') {
          setReferralLink(referralLinkResult.value.data?.referralLink || '');
        }

        if (referralStatsResult.status === 'fulfilled') {
          setReferralStats(referralStatsResult.value.data || { referrals: [], totalCkcEarned: 0 });
        }
      } catch (err) {
        if (mounted) {
          toast.error(getErrorMessage(err, 'Failed to load profile details'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchProfileData();

    return () => {
      mounted = false;
    };
  }, []);

  const onChangePassword = async (event) => {
    event.preventDefault();
    if (!passwordForm.oldPassword || !passwordForm.newPassword) {
      toast.error('Both old and new password are required');
      return;
    }

    setChangingPassword(true);
    try {
      const { data } = await api.post('/auth/change-password', passwordForm);
      toast.success(data?.message || 'Password changed successfully');
      setPasswordForm({ oldPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setChangingPassword(false);
    }
  };

  const onCopyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Referral link copied');
    } catch {
      toast.error('Could not copy referral link');
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold text-yellow-400">Profile</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">User Info</h2>
          {loading ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-5 animate-pulse rounded bg-gray-800" />)}
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-gray-300">
              <p><span className="text-gray-400">Name:</span> {user?.fullName || '—'}</p>
              <p><span className="text-gray-400">Email:</span> {user?.email || '—'}</p>
              <p><span className="text-gray-400">Country:</span> {user?.countryCode || '—'}</p>
              <p><span className="text-gray-400">Member since:</span> {memberSince}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">KYC Status</h2>
          <div className="mt-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${KYC_BADGE[kycStatus] || KYC_BADGE.PENDING}`}>
              {kycStatus}
            </span>
          </div>
          {kycStatus !== 'APPROVED' && (
            <Link to="/kyc" className="mt-3 inline-block text-sm text-yellow-300 hover:text-yellow-200">
              Complete verification →
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-white">Change Password</h2>
        <form onSubmit={onChangePassword} className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            type="password"
            placeholder="Old password"
            value={passwordForm.oldPassword}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, oldPassword: event.target.value }))}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-yellow-500"
          />
          <input
            type="password"
            placeholder="New password"
            value={passwordForm.newPassword}
            onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-yellow-500"
          />
          <button
            type="submit"
            disabled={changingPassword}
            className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">VIP Tier</h2>
          {loading ? (
            <div className="mt-3 h-16 animate-pulse rounded bg-gray-800" />
          ) : !vipStatus ? (
            <p className="mt-3 text-sm text-gray-400">VIP data unavailable.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-300">Current tier: <span className="font-semibold text-yellow-300">{vipStatus.tier?.name || 'N/A'}</span></p>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="h-full bg-yellow-500" style={{ width: `${Math.max(0, Math.min(100, Number(vipStatus.progressPct || 0)))}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {vipStatus.nextTier
                  ? `${formatNumber(vipStatus.ckcToNextTier)} CKC to ${vipStatus.nextTier.name}`
                  : 'Top VIP tier reached'}
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold text-white">Referral Program</h2>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={referralLink}
              readOnly
              placeholder="Generating referral link..."
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200"
            />
            <button
              type="button"
              onClick={onCopyReferral}
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              Copy
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-300">
            <p>Total referrals: {referralStats?.referrals?.length || 0}</p>
            <p>CKC earned: {referralStats?.totalCkcEarned || 0}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-white">Responsible Gambling</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link to="/responsible" className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-800">Set Limits</Link>
          <Link to="/responsible" className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-800">Cooling-off</Link>
          <Link to="/responsible" className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-800">Self-exclusion</Link>
        </div>
      </div>
    </section>
  );
}
