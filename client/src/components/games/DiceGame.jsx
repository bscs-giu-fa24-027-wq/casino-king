import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function DiceGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(game?.minStake || 1);
  const [prediction, setPrediction] = useState('high');
  const [rolling, setRolling] = useState(false);
  const [rollValue, setRollValue] = useState(1);
  const [result, setResult] = useState(null);

  const face = useMemo(() => diceFaces[(rollValue - 1) % 6], [rollValue]);

  const roll = async () => {
    setRolling(true);
    const timer = setInterval(() => setRollValue(Math.floor(Math.random() * 6) + 1), 90);

    try {
      const round = await playGameRound(game.id, { stakeCkc: toNumber(stake), prediction });
      const numericRoll = Number(round.rngResult?.roll || 1);
      setRollValue(((numericRoll - 1) % 6) + 1);
      setResult(round);
      onRoundComplete(round);
      toast.success(round.outcome === 'win' ? `You won ${formatCkc(round.payoutCkc)}` : 'Dice roll lost');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Dice roll failed'));
    } finally {
      clearInterval(timer);
      setRolling(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">High-Low Dice</h2>

      <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-2xl border border-gray-700 bg-gray-950 text-7xl">
        {face}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {['high', 'low'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPrediction(option)}
            className={`rounded-lg border px-4 py-1.5 text-sm ${
              prediction === option ? 'border-yellow-400 text-yellow-300' : 'border-gray-700 text-gray-200'
            }`}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          type="number"
          min={game?.minStake || 1}
          max={Math.min(game?.maxStake || 50, Math.max(game?.minStake || 1, Math.floor(balance || 1)))}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value || 0))}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
        />
        <button
          type="button"
          onClick={roll}
          disabled={rolling || stake <= 0}
          className="rounded-lg bg-yellow-500 px-6 py-2 font-semibold text-gray-900 disabled:opacity-50"
        >
          {rolling ? 'Rolling...' : 'Roll'}
        </button>
      </div>

      {result && (
        <p className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          Roll: {result.rngResult?.roll} · Result: {result.outcome} · Payout: {formatCkc(result.payoutCkc)}
        </p>
      )}
    </div>
  );
}
