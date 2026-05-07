import React from 'react';

const featured = ['Slots', 'Blackjack', 'Roulette', 'Crash', 'Dice', 'Poker'];

export default function LobbyPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-gray-800 bg-gradient-to-r from-yellow-500/10 to-purple-500/10 p-6">
        <h1 className="text-3xl font-bold text-yellow-400">Lobby</h1>
        <p className="mt-2 text-gray-300">Welcome to Casino King. Pick a game and start playing.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {featured.map((game) => (
          <div key={game} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-lg font-semibold text-white">{game}</h2>
            <p className="mt-1 text-sm text-gray-400">Integration point for {game} game card.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
