import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { formatCkc, getErrorMessage, playGameRound } from './gameApi';

const TICKET_COST = 5;
const DRAW_COUNTDOWN_SECONDS = 300;
const SECONDS_PER_MINUTE = 60;

function randomTicket() {
  const values = new Set();
  while (values.size < 5) {
    values.add(Math.floor(Math.random() * 40) + 1);
  }
  return [...values].sort((a, b) => a - b);
}

export default function LottoGame({ game, onRoundComplete }) {
  const [ticket, setTicket] = useState(() => randomTicket());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DRAW_COUNTDOWN_SECONDS);

  useEffect(() => {
    const timer = setInterval(
      () => setSecondsLeft((prev) => (prev > 0 ? prev - 1 : DRAW_COUNTDOWN_SECONDS)),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  const drawDisplay = useMemo(() => {
    if (!result) {
      return [];
    }
    const roll = Number(result.rngResult?.roll || 0);
    return [
      (roll % 40) + 1,
      ((roll + 7) % 40) + 1,
      ((roll + 14) % 40) + 1,
      ((roll + 21) % 40) + 1,
      ((roll + 28) % 40) + 1,
    ].sort((a, b) => a - b);
  }, [result]);

  const buyTicket = async () => {
    setLoading(true);
    try {
      const round = await playGameRound(game.id, { stakeCkc: TICKET_COST, ticketNumbers: ticket });
      setResult(round);
      onRoundComplete(round);
      toast.success(round.payoutCkc > 0 ? `Lotto win: ${formatCkc(round.payoutCkc)}` : 'Ticket purchased');
      setTicket(randomTicket());
    } catch (err) {
      toast.error(getErrorMessage(err, 'Ticket purchase failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold text-yellow-400">Weekly Lotto</h2>

      <div className="rounded-xl border border-gray-700 bg-gray-950 p-4">
        <p className="text-sm text-gray-400">Ticket Cost: {TICKET_COST} CKC</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ticket.map((n) => (
            <span key={n} className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-sm text-yellow-300">{n}</span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTicket(randomTicket())}
          className="mt-3 rounded-lg border border-gray-700 px-3 py-1 text-sm text-gray-200"
        >
          Quick Pick
        </button>
      </div>

      <button
        type="button"
        onClick={buyTicket}
        disabled={loading}
        className="rounded-lg bg-yellow-500 px-5 py-2 font-semibold text-gray-900 disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Buy Ticket'}
      </button>

      <p className="text-sm text-gray-400">
        Next draw in: {Math.floor(secondsLeft / SECONDS_PER_MINUTE)}:
        {String(secondsLeft % SECONDS_PER_MINUTE).padStart(2, '0')}
      </p>

      {result && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
          <p>Draw: {drawDisplay.join(', ') || '-'}</p>
          <p>Outcome: {result.outcome} · Payout: {formatCkc(result.payoutCkc)}</p>
        </div>
      )}
    </div>
  );
}
