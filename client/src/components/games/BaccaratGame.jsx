import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

function renderCard(card) {
  return `${card.rank}${card.suit}`;
}

export default function BaccaratGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(game?.minStake || 20);
  const [bet, setBet] = useState('player');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const deal = async () => {
    setLoading(true);
    try {
      const round = await playGameRound(game.id, { stakeCkc: toNumber(stake), bet });
      setResult(round);
      onRoundComplete(round);
      toast.success(`Winner: ${round.rngResult?.winner || round.outcome}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Baccarat deal failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">Classic Baccarat</h2>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-700 bg-gray-950 p-3">
          <p className="text-sm text-gray-400">Player ({result?.rngResult?.playerTotal ?? '-'})</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(result?.rngResult?.playerCards || []).map((card, i) => (
              <span key={`p-${i}`} className="rounded border border-gray-700 bg-gray-800 px-2 py-1">{renderCard(card)}</span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-950 p-3">
          <p className="text-sm text-gray-400">Banker ({result?.rngResult?.bankerTotal ?? '-'})</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(result?.rngResult?.bankerCards || []).map((card, i) => (
              <span key={`b-${i}`} className="rounded border border-gray-700 bg-gray-800 px-2 py-1">{renderCard(card)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['player', 'banker', 'tie'].map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setBet(side)}
            className={`rounded-lg border px-4 py-1.5 text-sm ${
              bet === side ? 'border-yellow-400 text-yellow-300' : 'border-gray-700 text-gray-200'
            }`}
          >
            {side.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          type="number"
          min={game?.minStake || 1}
          max={Math.min(game?.maxStake || 500, Math.max(game?.minStake || 1, Math.floor(balance || 1)))}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value || 0))}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
        />
        <button
          type="button"
          onClick={deal}
          disabled={loading || stake <= 0}
          className="rounded-lg bg-yellow-500 px-5 py-2 font-semibold text-gray-900 disabled:opacity-50"
        >
          {loading ? 'Dealing...' : 'Deal'}
        </button>
      </div>

      {result && (
        <p className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          Result: {result.rngResult?.winner} · Payout: {formatCkc(result.payoutCkc)}
        </p>
      )}
    </div>
  );
}
