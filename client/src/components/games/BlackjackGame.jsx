import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound, toNumber } from './gameApi';

function cardText(card) {
  return `${card.rank}${card.suit}`;
}

export default function BlackjackGame({ game, balance, onRoundComplete }) {
  const [stake, setStake] = useState(game?.minStake || 10);
  const [dealerCards, setDealerCards] = useState([]);
  const [playerCards, setPlayerCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const hiddenDealerCards = useMemo(() => {
    if (!dealerCards.length) {
      return [];
    }
    if (result) {
      return dealerCards;
    }
    return [dealerCards[0], { rank: '?', suit: '🂠' }];
  }, [dealerCards, result]);

  const handValue = (cards) => {
    if (!cards?.length) {
      return 0;
    }
    let total = 0;
    let aces = 0;
    cards.forEach((card) => {
      if (['J', 'Q', 'K'].includes(card.rank)) total += 10;
      else if (card.rank === 'A') {
        total += 11;
        aces += 1;
      } else {
        total += Number(card.rank);
      }
    });
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  };

  const playAction = async (action) => {
    setLoading(true);
    try {
      const round = await playGameRound(game.id, { stakeCkc: toNumber(stake), action });
      const rng = round.rngResult || {};
      setDealerCards(rng.dealerCards || []);
      setPlayerCards(rng.playerCards || []);
      setResult(round);
      onRoundComplete(round);
      toast.success(`Round result: ${round.outcome}`);
    } catch (err) {
      toast.error(getErrorMessage(err, `Blackjack ${action} failed`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">Blackjack 21</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p className="mb-2 text-sm text-gray-400">Dealer ({handValue(dealerCards)})</p>
          <div className="flex flex-wrap gap-2">
            {hiddenDealerCards.map((card, i) => (
              <div key={`d-${i}`} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-lg">
                {cardText(card)}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
          <p className="mb-2 text-sm text-gray-400">Player ({handValue(playerCards)})</p>
          <div className="flex flex-wrap gap-2">
            {playerCards.map((card, i) => (
              <div key={`p-${i}`} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-lg">
                {cardText(card)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <input
          type="number"
          min={game?.minStake || 1}
          max={Math.min(game?.maxStake || 500, Math.max(game?.minStake || 1, Math.floor(balance || 1)))}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value || 0))}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
        />
        <div className="flex flex-wrap gap-2">
          {['hit', 'stand', 'double'].map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => playAction(action)}
              disabled={loading || stake <= 0}
              className="rounded-lg border border-yellow-500/50 px-4 py-2 text-sm text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50"
            >
              {action === 'double' ? 'Double Down' : action[0].toUpperCase() + action.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/80 p-4 text-center text-sm">
          <p className="font-semibold text-white">{result.outcome.toUpperCase()}</p>
          <p className="text-green-400">Payout: {formatCkc(result.payoutCkc)}</p>
        </div>
      )}
    </div>
  );
}
