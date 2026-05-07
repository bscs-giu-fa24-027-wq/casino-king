import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

const MULTIPLIER_INCREMENT = 0.07;

export default function CrashGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(game?.minStake || 5);
  const [multiplier, setMultiplier] = useState(1);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [roundSettled, setRoundSettled] = useState(false);
  const [result, setResult] = useState(null);
  const [graph, setGraph] = useState([1]);
  const [localCrashPoint, setLocalCrashPoint] = useState(2.5);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMultiplier((prev) => {
        const next = Number((prev + MULTIPLIER_INCREMENT).toFixed(2));
        setGraph((g) => [...g.slice(-39), next]);
        if (next >= localCrashPoint) {
          setActive(false);
        }
        return next;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [active, localCrashPoint]);

  const startRound = () => {
    setResult(null);
    setRoundSettled(false);
    setMultiplier(1);
    setGraph([1]);
    setLocalCrashPoint(Number((Math.random() * 4 + 1.5).toFixed(2)));
    setActive(true);
  };

  const settleRound = useCallback(async (cashOutAt) => {
    if (roundSettled) {
      return;
    }
    setRoundSettled(true);
    setLoading(true);
    try {
      const round = await playGameRound(game.id, {
        stakeCkc: toNumber(stake),
        cashOutAt: Number(cashOutAt.toFixed(2)),
        action: 'cashout',
      });
      setResult(round);
      onRoundComplete(round);
      toast.success(round.outcome === 'win' ? `Cashed out ${formatCkc(round.payoutCkc)}` : 'Crashed before cashout');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Crash round failed'));
    } finally {
      setLoading(false);
    }
  }, [game.id, onRoundComplete, roundSettled, stake]);

  useEffect(() => {
    if (!active && multiplier > 1 && !result && !loading && !roundSettled) {
      settleRound(multiplier);
    }
  }, [active, loading, multiplier, result, roundSettled, settleRound]);

  const bars = useMemo(() => graph.slice(-20), [graph]);

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">Crash Rocket</h2>

      <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-center">
        <p className={`text-4xl font-bold ${active ? 'text-green-400' : 'text-white'}`}>{multiplier.toFixed(2)}x</p>
        <div className="mt-4 flex h-20 items-end justify-center gap-1">
          {bars.map((point, i) => (
            <span key={`${point}-${i}`} className="w-2 rounded-t bg-purple-500/70" style={{ height: `${Math.min(100, point * 20)}%` }} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <input
          type="number"
          min={game?.minStake || 1}
          max={Math.min(game?.maxStake || 200, Math.max(game?.minStake || 1, Math.floor(balance || 1)))}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value || 0))}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
        />
        <button
          type="button"
          onClick={startRound}
          disabled={active || loading || stake <= 0}
          className="rounded-lg border border-gray-700 px-4 py-2 text-gray-100 disabled:opacity-50"
        >
          Start
        </button>
        <button
          type="button"
          onClick={() => {
            setActive(false);
            settleRound(multiplier);
          }}
          disabled={!active || loading}
          className="rounded-lg bg-yellow-500 px-5 py-2 font-semibold text-gray-900 disabled:opacity-50"
        >
          Cashout
        </button>
      </div>

      {result && (
        <p className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          Crash point: {result.rngResult?.crashPoint}x · Payout: {formatCkc(result.payoutCkc)}
        </p>
      )}
    </div>
  );
}
