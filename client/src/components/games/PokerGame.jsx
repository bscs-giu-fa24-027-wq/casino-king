import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

function cardText(card) {
  return `${card.rank}${card.suit}`;
}

export default function PokerGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(game?.minStake || 10);
  const [hand, setHand] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const deal = async () => {
    setLoading(true);
    try {
      const round = await playGameRound(game.id, { stakeCkc: toNumber(stake) });
      setHand(round.rngResult?.hand || []);
      setResult(round);
      onRoundComplete(round);
      toast.success(round.outcome === 'win' ? `Hand win: ${formatCkc(round.payoutCkc)}` : 'No payout this hand');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Poker hand failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">Texas Hold'em Poker</h2>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {(hand.length ? hand : Array.from({ length: 5 }, () => ({ rank: '?', suit: '🂠' }))).map((card, i) => (
          <div key={i} className="flex h-24 items-center justify-center rounded-lg border border-gray-700 bg-gray-950 text-xl">
            {cardText(card)}
          </div>
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
          {loading ? 'Dealing...' : 'New Hand'}
        </button>
      </div>

      {result && (
        <p className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          Ranking: {result.rngResult?.handName || 'N/A'} · Payout: {formatCkc(result.payoutCkc)}
        </p>
      )}
    </div>
  );
}
