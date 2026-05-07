import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import api from '../api/axios';
import BaccaratGame from '../components/games/BaccaratGame.jsx';
import BlackjackGame from '../components/games/BlackjackGame.jsx';
import CrashGame from '../components/games/CrashGame.jsx';
import DiceGame from '../components/games/DiceGame.jsx';
import LottoGame from '../components/games/LottoGame.jsx';
import PokerGame from '../components/games/PokerGame.jsx';
import RouletteGame from '../components/games/RouletteGame.jsx';
import SlotsGame from '../components/games/SlotsGame.jsx';
import { formatCkc, getErrorMessage, toNumber } from '../components/games/gameApi';
import { useAuth } from '../context/AuthContext.jsx';

const gameComponentMap = {
  SLOTS: SlotsGame,
  BLACKJACK: BlackjackGame,
  ROULETTE: RouletteGame,
  DICE: DiceGame,
  CRASH: CrashGame,
  POKER: PokerGame,
  BACCARAT: BaccaratGame,
  LOTTO: LottoGame,
};

const gameRules = {
  SLOTS: 'Match symbols across lines. Bigger multipliers award higher payouts.',
  BLACKJACK: 'Try to beat dealer hand value without busting over 21.',
  ROULETTE: 'Place bets on number, color, or parity before spinning.',
  DICE: 'Predict high (51-100) or low (1-50). Win returns 1.96x.',
  CRASH: 'Multiplier climbs from 1.00x until it crashes. Cash out before crash.',
  POKER: 'Receive 5 cards and get paid based on hand ranking.',
  BACCARAT: 'Bet on Player, Banker, or Tie and compare final totals modulo 10.',
  LOTTO: 'Buy a fixed 5 CKC ticket for a chance at bigger multipliers.',
};

function normalizeBalanceWalletValue(balance) {
  if (typeof balance === 'number') {
    return balance;
  }
  if (balance?.ckcBalance !== undefined) {
    return toNumber(balance.ckcBalance);
  }
  return 0;
}

export default function GamePage() {
  const { id } = useParams();
  const { wallet, setWallet } = useAuth();
  const [game, setGame] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(normalizeBalanceWalletValue(wallet));

  useEffect(() => {
    setBalance(normalizeBalanceWalletValue(wallet));
  }, [wallet]);

  useEffect(() => {
    let mounted = true;

    const fetchGame = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/games/${id}`);
        if (mounted) {
          setGame(data);
        }
      } catch (err) {
        try {
          const { data } = await api.get('/games');
          const matched = (data || []).find((entry) => entry.category?.toLowerCase() === String(id).toLowerCase());
          if (mounted) {
            setGame(matched || null);
            if (!matched) {
              toast.error(getErrorMessage(err, 'Game not found'));
            }
          }
        } catch (fallbackErr) {
          if (mounted) {
            toast.error(getErrorMessage(fallbackErr, 'Failed to load game'));
            setGame(null);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchGame();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;

    const fetchHistory = async () => {
      try {
        const { data } = await api.get('/games/history', { params: { limit: 50 } });
        if (!mounted) {
          return;
        }
        const rounds = (data?.rounds || []).filter((round) => round.gameId === game?.id).slice(0, 10);
        setHistory(rounds);
      } catch (err) {
        if (mounted) {
          setHistory([]);
        }
      }
    };

    if (game?.id) {
      fetchHistory();
    }

    return () => {
      mounted = false;
    };
  }, [game?.id]);

  const onRoundComplete = (round) => {
    const nextBalance = toNumber(round.newBalance);
    setBalance(nextBalance);
    setWallet((prev) => ({ ...(prev || {}), ckcBalance: nextBalance }));
    setHistory((prev) => [
      {
        id: `${Date.now()}`,
        outcome: round.outcome,
        stakeCkc: round.stakeCkc,
        payoutCkc: round.payoutCkc,
        playedAt: new Date().toISOString(),
        gameId: game.id,
      },
      ...prev,
    ].slice(0, 10));
  };

  const GameComponent = useMemo(() => (game?.category ? gameComponentMap[game.category] : null), [game?.category]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-gray-300">Loading game...</div>;
  }

  if (!game || !GameComponent) {
    return <div className="rounded-2xl border border-red-500/30 bg-gray-900 p-6 text-red-300">Game not found.</div>;
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div>
            <h1 className="text-2xl font-bold text-yellow-400">{game.name}</h1>
            <p className="text-sm text-gray-400">Category: {game.category}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-yellow-500/50 bg-yellow-500/10 px-3 py-1 text-sm text-yellow-300">
              Balance: {formatCkc(balance)}
            </span>
            <Dialog.Root>
              <Dialog.Trigger className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800">
                Rules
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-700 bg-gray-900 p-5 text-gray-100">
                  <div className="mb-3 flex items-start justify-between">
                    <Dialog.Title className="text-lg font-semibold text-yellow-400">{game.name} Rules</Dialog.Title>
                    <Dialog.Close className="rounded p-1 text-gray-400 hover:bg-gray-800"><X size={16} /></Dialog.Close>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-300">{gameRules[game.category] || 'Play responsibly and stake within your limits.'}</p>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>

        <GameComponent game={game} balance={balance} onRoundComplete={onRoundComplete} />
      </div>

      <aside className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-semibold text-yellow-400">Last 10 Rounds</h2>
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No rounds played yet.</p>
          ) : (
            history.map((round) => (
              <div key={round.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
                <p className="font-semibold text-white">{round.outcome}</p>
                <p>Stake: {formatCkc(round.stakeCkc)}</p>
                <p>Payout: {formatCkc(round.payoutCkc)}</p>
                <p className="text-gray-500">{new Date(round.playedAt).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </aside>
    </section>
  );
}
