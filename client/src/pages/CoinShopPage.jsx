import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext.jsx';

const PACKAGES = [
  { id: 'starter', name: 'Starter', usdPrice: 5, baseCkc: 50, bonusCkc: 0 },
  { id: 'bronze', name: 'Bronze', usdPrice: 10, baseCkc: 100, bonusCkc: 5 },
  { id: 'silver', name: 'Silver', usdPrice: 25, baseCkc: 250, bonusCkc: 25 },
  { id: 'gold', name: 'Gold', usdPrice: 50, baseCkc: 500, bonusCkc: 75, popular: true },
  { id: 'diamond', name: 'Diamond', usdPrice: 100, baseCkc: 1000, bonusCkc: 200 },
];

const getErrorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || fallback;

const formatCkc = (value) => `${Number(value || 0).toLocaleString()} CKC`;

export default function CoinShopPage() {
  const { token, wallet } = useAuth();
  const [buying, setBuying] = useState('');
  const [depositBonusPct, setDepositBonusPct] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadVipInfo = async () => {
      if (!token) {
        setDepositBonusPct(null);
        return;
      }
      try {
        const { data } = await api.get('/vip/status');
        if (mounted) {
          setDepositBonusPct(Number(data?.depositBonusPct || 0));
        }
      } catch {
        if (mounted) setDepositBonusPct(0);
      }
    };

    loadVipInfo();

    return () => {
      mounted = false;
    };
  }, [token]);

  const isNewUser = Number(wallet?.lifetimeDeposited || 0) === 0;

  const onBuy = async (pkg) => {
    if (!token || buying) {
      if (!token) toast.error('Please log in to buy CKC packages');
      return;
    }

    setBuying(pkg.id);
    try {
      const { data } = await api.post('/payments/create-checkout', { packageId: pkg.id });
      if (data?.checkoutUrl) {
        toast.success('Redirecting to Stripe checkout...');
        window.location.href = data.checkoutUrl;
        return;
      }
      toast.error('Checkout URL was not returned');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create checkout session'));
    } finally {
      setBuying('');
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-800 bg-gradient-to-r from-yellow-500/15 to-orange-500/10 p-6">
        <h1 className="text-3xl font-bold text-yellow-400">Coin Shop</h1>
        <p className="mt-2 text-gray-200">Secure CKC top-ups with instant Stripe checkout.</p>
      </div>

      {isNewUser && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          🎉 New player bonus: your first deposit gets a special match boost.
        </div>
      )}

      <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 text-sm text-purple-100">
        VIP deposit bonus: <span className="font-semibold text-white">{depositBonusPct ?? 0}%</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PACKAGES.map((pkg) => {
          const total = pkg.baseCkc + pkg.bonusCkc;
          return (
            <article
              key={pkg.id}
              className={`relative rounded-2xl border p-4 ${pkg.popular ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-800 bg-gray-900'}`}
            >
              {pkg.popular && (
                <span className="absolute -top-2 right-3 rounded-full bg-yellow-500 px-2 py-0.5 text-xs font-bold text-black">
                  Popular
                </span>
              )}

              <h2 className="text-lg font-semibold text-white">{pkg.name}</h2>
              <p className="mt-1 text-2xl font-bold text-yellow-300">${pkg.usdPrice}</p>

              <div className="mt-4 space-y-1 text-sm text-gray-300">
                <p>Base: {formatCkc(pkg.baseCkc)}</p>
                <p>
                  Bonus: <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">+{formatCkc(pkg.bonusCkc)}</span>
                </p>
                <p className="font-semibold text-white">Total: {formatCkc(total)}</p>
              </div>

              <button
                type="button"
                onClick={() => onBuy(pkg)}
                disabled={buying === pkg.id}
                className="mt-4 w-full rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {buying === pkg.id ? 'Processing...' : 'Buy'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
