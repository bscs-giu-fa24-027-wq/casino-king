import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext.jsx';

const CKC_PER_USD = 10;
const PAGE_SIZE = 10;

const getErrorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || fallback;

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatCkc = (value) => `${toNumber(value).toFixed(2)} CKC`;
const formatUsd = (value) => `$${toNumber(value).toFixed(2)}`;
const ckcToUsd = (ckcAmount) => toNumber(ckcAmount) / CKC_PER_USD;
const formatDateTime = (value) => new Date(value).toLocaleString('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const TYPE_BADGE = {
  PURCHASE: 'bg-emerald-500/20 text-emerald-300',
  REDEMPTION: 'bg-orange-500/20 text-orange-300',
  GAME_STAKE: 'bg-blue-500/20 text-blue-300',
  GAME_WIN: 'bg-purple-500/20 text-purple-300',
  BONUS: 'bg-yellow-500/20 text-yellow-300',
  REFERRAL: 'bg-cyan-500/20 text-cyan-300',
};

const STATUS_BADGE = {
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  FAILED: 'bg-red-500/20 text-red-300',
  REVERSED: 'bg-gray-500/20 text-gray-300',
};

export default function WalletPage() {
  const { wallet, refreshWallet } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [cashoutAmount, setCashoutAmount] = useState('100');
  const [submittingCashout, setSubmittingCashout] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/wallet/transactions', {
        params: { page: 1, limit: 100 },
      });
      setTransactions(data?.transactions || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load wallet transactions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWallet();
    fetchTransactions();
  }, [fetchTransactions, refreshWallet]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  const filteredTransactions = useMemo(() => {
    if (typeFilter === 'ALL') return transactions;
    return transactions.filter((tx) => tx.type === typeFilter);
  }, [transactions, typeFilter]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE)),
    [filteredTransactions.length]
  );
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredTransactions, page]);

  const ckcBalance = toNumber(wallet?.ckcBalance);
  const usdEquivalent = ckcToUsd(ckcBalance);
  const estimatedUsdPayout = ckcToUsd(cashoutAmount);

  const onCashout = async (event) => {
    event.preventDefault();
    const parsed = toNumber(cashoutAmount);

    if (parsed < 100) {
      toast.error('Minimum cashout is 100 CKC');
      return;
    }

    setSubmittingCashout(true);
    try {
      const { data } = await api.post('/payments/cashout', { ckcAmount: parsed });
      toast.success(`Cashout requested (${formatUsd(data?.usdAmount ?? estimatedUsdPayout)})`);
      setCashoutAmount('100');
      await refreshWallet();
      await fetchTransactions();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Cashout failed'));
    } finally {
      setSubmittingCashout(false);
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold text-yellow-400">Wallet</h1>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-white">Balance</h2>
        <p className="mt-3 text-3xl font-bold text-yellow-300">{formatCkc(ckcBalance)}</p>
        <p className="text-sm text-gray-400">≈ {formatUsd(usdEquivalent)}</p>
      </div>

      <form onSubmit={onCashout} className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-white">Cashout</h2>
        <p className="mt-1 text-sm text-gray-400">Minimum 100 CKC</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="number"
            min="100"
            step="1"
            value={cashoutAmount}
            onChange={(event) => setCashoutAmount(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-yellow-500"
            placeholder="Enter CKC amount"
          />
          <button
            type="submit"
            disabled={submittingCashout}
            className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingCashout ? 'Submitting...' : 'Submit Cashout'}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-300">Estimated payout: {formatUsd(estimatedUsdPayout)}</p>
      </form>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Transaction History</h2>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 outline-none focus:border-yellow-500"
          >
            <option value="ALL">All Types</option>
            <option value="PURCHASE">Purchase</option>
            <option value="REDEMPTION">Redemption</option>
            <option value="GAME_STAKE">Game Stake</option>
            <option value="GAME_WIN">Game Win</option>
            <option value="BONUS">Bonus</option>
            <option value="REFERRAL">Referral</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded-lg border border-gray-800 bg-gray-950" />
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <p className="rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-400">No transactions found for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-gray-400">
                <tr className="border-b border-gray-800">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx) => {
                  const usd = tx.usdAmount ?? ckcToUsd(tx.ckcAmount);
                  return (
                    <tr key={tx.id} className="border-b border-gray-900">
                      <td className="px-2 py-2 text-gray-300">{formatDateTime(tx.createdAt)}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${TYPE_BADGE[tx.type] || 'bg-gray-500/20 text-gray-300'}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-200">{formatCkc(tx.ckcAmount)} / {formatUsd(usd)}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_BADGE[tx.status] || 'bg-gray-500/20 text-gray-300'}`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-gray-400">Page {page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
