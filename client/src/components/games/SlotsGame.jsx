import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

const symbols = ['7️⃣', '🍒', '🔔', '🟥', '⭐', '🍋'];
const SPIN_ANIMATION_INTERVAL = 100;

function randomGrid() {
  return Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]));
}

export default function SlotsGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(Math.max(1, game?.minStake || 1));
  const [grid, setGrid] = useState(() => randomGrid());
  const [spinning, setSpinning] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [result, setResult] = useState(null);

  const winLines = useMemo(() => {
    if (!result || result.payoutCkc <= 0) {
      return [];
    }
    if (result.rngResult?.multiplier >= 5) {
      return [0, 1, 2];
    }
    return [1];
  }, [result]);

  const maxStake = Math.min(game?.maxStake || 100, Math.max(game?.minStake || 1, Math.floor(balance || 1)));

  const spin = async () => {
    setSpinning(true);
    setResult(null);

    const timer = setInterval(() => setGrid(randomGrid()), SPIN_ANIMATION_INTERVAL);

    try {
      const round = await playGameRound(game.id, { stakeCkc: toNumber(stake) });
      clearInterval(timer);
      setGrid(randomGrid());
      setResult(round);
      onRoundComplete(round);
      toast.success(round.payoutCkc > 0 ? `You won ${formatCkc(round.payoutCkc)}` : 'No win this spin');
    } catch (err) {
      clearInterval(timer);
      toast.error(getErrorMessage(err, 'Spin failed'));
    } finally {
      setSpinning(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-yellow-400">Lucky Slots</h2>
        <button
          type="button"
          onClick={() => setSoundOn((prev) => !prev)}
          className="rounded-lg border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-800"
        >
          {soundOn ? '🔊 Sound On' : '🔇 Sound Off'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-950 p-3">
        {grid.map((row, r) => row.map((symbol, c) => (
          <div
            key={`${r}-${c}`}
            className={`flex h-20 items-center justify-center rounded-lg border text-3xl ${
              winLines.includes(r) ? 'border-yellow-400 bg-yellow-500/10' : 'border-gray-800 bg-gray-900'
            }`}
          >
            {symbol}
          </div>
        )))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <label className="text-sm text-gray-300">Stake: {stake} CKC</label>
          <input
            type="range"
            min={game?.minStake || 1}
            max={maxStake}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full"
          />
          <input
            type="number"
            min={game?.minStake || 1}
            max={maxStake}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value || 0))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          />
        </div>
        <button
          type="button"
          onClick={spin}
          disabled={spinning || stake <= 0}
          className="rounded-xl bg-yellow-500 px-6 py-3 font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {spinning ? 'Spinning...' : 'Spin'}
        </button>
      </div>

      {result && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          Outcome: <span className="font-semibold text-white">{result.outcome}</span> · Payout:{' '}
          <span className="font-semibold text-green-400">{formatCkc(result.payoutCkc)}</span>
        </div>
      )}
    </div>
  );
}
