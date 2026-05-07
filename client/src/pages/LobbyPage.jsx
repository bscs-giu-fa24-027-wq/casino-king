import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext.jsx';

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatCkc = (value) => `${toNumber(value).toFixed(2)} CKC`;

const getErrorMessage = (err, fallback) => err?.response?.data?.message || err?.response?.data?.error || fallback;

function CardSkeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl border border-gray-800 bg-gray-900 ${className}`} />;
}

export default function LobbyPage() {
  const { user, token, wallet } = useAuth();
  const [games, setGames] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [missions, setMissions] = useState([]);
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const balance = useMemo(() => toNumber(wallet?.ckcBalance), [wallet?.ckcBalance]);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const calls = [
          api.get('/games'),
          api.get('/leaderboard/weekly'),
        ];

        if (token) {
          calls.push(api.get('/missions'));
          calls.push(api.get('/bonuses/streak'));
        }

        const results = await Promise.allSettled(calls);
        if (!mounted) return;

        const [gamesResult, leaderboardResult, missionsResult, streakResult] = results;

        if (gamesResult?.status === 'fulfilled') {
          setGames((gamesResult.value.data || []).slice(0, 6));
        }

        if (leaderboardResult?.status === 'fulfilled') {
          setLeaderboard((leaderboardResult.value.data?.entries || []).slice(0, 5));
        }

        if (token) {
          if (missionsResult?.status === 'fulfilled') {
            setMissions((missionsResult.value.data || []).slice(0, 3));
          }
          if (streakResult?.status === 'fulfilled') {
            setStreak(streakResult.value.data || null);
          }
        }
      } catch (err) {
        if (mounted) {
          toast.error(getErrorMessage(err, 'Failed to load lobby'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [token]);

  const onClaimDailyBonus = async () => {
    if (!token || claiming) return;
    setClaiming(true);
    try {
      const { data } = await api.post('/bonuses/claim');
      toast.success(data?.message || `Daily bonus claimed (${formatCkc(data?.ckcAwarded || streak?.ckcIfClaimed || 0)})`);
      const { data: latestStreak } = await api.get('/bonuses/streak');
      setStreak(latestStreak);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Unable to claim daily bonus'));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-800 bg-gradient-to-r from-yellow-500/15 to-purple-500/15 p-6">
        <p className="text-sm uppercase tracking-wider text-yellow-200/80">Casino King</p>
        <h1 className="mt-1 text-3xl font-bold text-yellow-400">
          Welcome{user?.fullName ? `, ${user.fullName}` : ''}
        </h1>
        <p className="mt-2 text-gray-200">Play smart, complete missions, and climb the leaderboard.</p>
        <div className="mt-4 inline-flex rounded-full border border-yellow-500/40 bg-black/30 px-4 py-2 text-sm font-medium text-yellow-200">
          CKC Balance: {formatCkc(balance)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xl font-semibold text-yellow-400">Daily Bonus</h2>
          {!token ? (
            <p className="mt-2 text-sm text-gray-400">Log in to track your streak and claim daily CKC.</p>
          ) : loading ? (
            <CardSkeleton className="mt-3 h-24" />
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-300">Current streak: <span className="font-semibold text-white">{streak?.streakDays || 0} days</span></p>
              <p className="text-sm text-gray-400">Today's bonus: {formatCkc(streak?.ckcIfClaimed || 0)}</p>
              <button
                type="button"
                onClick={onClaimDailyBonus}
                disabled={claiming || streak?.claimedToday}
                className="mt-4 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {streak?.claimedToday ? 'Claimed Today' : claiming ? 'Claiming...' : 'Claim Bonus'}
              </button>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 to-pink-500/10 p-5">
          <h2 className="text-xl font-semibold text-purple-200">VIP Program</h2>
          <p className="mt-2 text-sm text-purple-100/90">Unlock better deposit bonuses, exclusive perks, and faster support as your tier grows.</p>
          <Link to="/vip" className="mt-4 inline-block rounded-lg border border-purple-300/40 px-4 py-2 text-sm font-medium text-purple-100 hover:bg-purple-500/15">
            Explore VIP Benefits
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-yellow-400">Featured Games</h2>
          <Link to="/games/slots" className="text-sm text-yellow-300 hover:text-yellow-200">View all</Link>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => <CardSkeleton key={idx} className="h-28" />)}
          </div>
        ) : games.length === 0 ? (
          <p className="rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-400">No featured games available yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {games.map((game) => (
              <Link key={game.id} to={`/games/${String(game.category || '').toLowerCase()}`} className="rounded-xl border border-gray-800 bg-gray-950 p-4 transition hover:border-yellow-500/40">
                <p className="text-sm text-yellow-300">{game.category}</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{game.name}</h3>
                <p className="mt-2 text-xs text-gray-400">Stake: {game.minStake} - {game.maxStake} CKC</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xl font-semibold text-yellow-400">Active Missions</h2>
          {!token ? (
            <p className="mt-3 text-sm text-gray-400">Log in to view mission progress and rewards.</p>
          ) : loading ? (
            <div className="mt-3 space-y-2">{Array.from({ length: 3 }).map((_, idx) => <CardSkeleton key={idx} className="h-16" />)}</div>
          ) : missions.length === 0 ? (
            <p className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-400">No active missions right now.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {missions.map((mission) => (
                <div key={mission.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                  <p className="text-sm font-semibold text-white">{mission.title}</p>
                  <p className="text-xs text-gray-400">{mission.userProgress?.progress || 0}/{mission.targetValue} • Reward {mission.rewardCkc} CKC</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xl font-semibold text-yellow-400">Weekly Leaderboard</h2>
          {loading ? (
            <div className="mt-3 space-y-2">{Array.from({ length: 5 }).map((_, idx) => <CardSkeleton key={idx} className="h-12" />)}</div>
          ) : leaderboard.length === 0 ? (
            <p className="mt-3 rounded-lg border border-gray-800 bg-gray-950 p-4 text-sm text-gray-400">No leaderboard entries yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {leaderboard.map((entry, idx) => (
                <div key={`${entry.username}-${idx}`} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                  <p className="text-sm text-gray-200">#{entry.rank || idx + 1} {entry.username}</p>
                  <p className="text-sm font-medium text-yellow-300">{formatCkc(entry.totalWagered)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
