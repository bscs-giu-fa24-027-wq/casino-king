import React from 'react';
import { Link } from 'react-router-dom';

const GAMES = [
  { slug: 'slots', name: '🎰 Slot Machine', description: 'Classic 3-reel slots. Match symbols to win up to 50×!', minBet: '$0.50' },
  { slug: 'roulette', name: '🎡 Roulette', description: 'European roulette — bet on numbers, red or black.', minBet: '$1.00' },
  { slug: 'blackjack', name: '🃏 Blackjack', description: 'Beat the dealer to 21. Blackjack pays 2.5×!', minBet: '$1.00' },
];

export default function LobbyPage() {
  return (
    <div>
      <h2 className="text-3xl font-bold text-yellow-400 mb-8">Game Lobby</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {GAMES.map((game) => (
          <div
            key={game.slug}
            className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-yellow-500/50 transition-all cursor-pointer"
          >
            <h3 className="text-2xl font-bold text-white mb-2">{game.name}</h3>
            <p className="text-gray-400 mb-4">{game.description}</p>
            <p className="text-sm text-gray-500">Min bet: {game.minBet}</p>
            <button className="mt-4 w-full py-2 bg-yellow-500 text-gray-900 font-bold rounded-lg hover:bg-yellow-400 transition-all">
              Play
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
