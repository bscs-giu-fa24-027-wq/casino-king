import React from 'react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="text-center py-20">
      <h1 className="text-6xl font-extrabold text-yellow-400 mb-4">🎰 Casino King</h1>
      <p className="text-xl text-gray-400 mb-10 max-w-xl mx-auto">
        The premier online casino experience. Slots, Roulette, Blackjack and more — powered by
        provably fair RNG.
      </p>
      <div className="flex justify-center gap-4">
        <Link
          to="/register"
          className="px-8 py-3 bg-yellow-500 text-gray-900 font-bold rounded-full text-lg hover:bg-yellow-400 transition-all"
        >
          Play Now
        </Link>
        <Link
          to="/login"
          className="px-8 py-3 border border-yellow-500 text-yellow-400 font-bold rounded-full text-lg hover:bg-yellow-500/10 transition-all"
        >
          Login
        </Link>
      </div>
    </div>
  );
}
