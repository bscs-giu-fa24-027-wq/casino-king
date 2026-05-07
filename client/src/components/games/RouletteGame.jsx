import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export default function RouletteGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(game?.minStake || 5);
  const [betType, setBetType] = useState('red');
  const [betValue, setBetValue] = useState('1');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const selectedNumber = useMemo(() => Number(betValue), [betValue]);

  const spin = async () => {
    setSpinning(true);
    try {
      const round = await playGameRound(game.id, {
        stakeCkc: toNumber(stake),
        betType,
        betValue: betType === 'number' ? selectedNumber : undefined,
      });
      setResult(round);
      onRoundComplete(round);
      toast.success(round.payoutCkc > 0 ? `Win: ${formatCkc(round.payoutCkc)}` : 'Better luck next spin');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Roulette spin failed'));
    } finally {
      setSpinning(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">European Roulette</h2>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="relative mx-auto flex h-52 w-52 items-center justify-center rounded-full border-8 border-gray-700 bg-gray-950">
          <div className={`h-40 w-40 rounded-full border border-yellow-500/40 ${spinning ? 'animate-spin' : ''}`} />
          <div className={`absolute h-3 w-3 rounded-full bg-white ${spinning ? 'animate-ping' : ''}`} />
          <span className="absolute text-xs text-gray-400">Wheel</span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-2 md:grid-cols-12">
            {Array.from({ length: 37 }, (_, n) => n).map((n) => {
              const isRed = redNumbers.has(n);
              return (
                <button
                  type="button"
                  key={n}
                  onClick={() => {
                    setBetType('number');
                    setBetValue(String(n));
                  }}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    selectedNumber === n && betType === 'number'
                      ? 'ring-2 ring-yellow-400'
                      : 'border border-gray-700'
                  } ${n === 0 ? 'bg-green-700' : isRed ? 'bg-red-700' : 'bg-gray-800'} text-white`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {['red', 'black', 'odd', 'even'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBetType(option)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  betType === option ? 'border-yellow-400 text-yellow-300' : 'border-gray-700 text-gray-200'
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
              max={Math.min(game?.maxStake || 250, Math.max(game?.minStake || 1, Math.floor(balance || 1)))}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value || 0))}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            />
            <button
              type="button"
              onClick={spin}
              disabled={spinning || stake <= 0}
              className="rounded-lg bg-yellow-500 px-5 py-2 font-semibold text-gray-900 disabled:opacity-50"
            >
              {spinning ? 'Spinning...' : 'Spin'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          Result: {result.rngResult?.spin} ({result.rngResult?.color}) · Winnings:{' '}
          <span className="font-semibold text-green-400">{formatCkc(result.payoutCkc)}</span>
        </div>
      )}
    </div>
  );
}
