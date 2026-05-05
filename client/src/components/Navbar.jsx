import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="bg-gray-900 border-b border-yellow-500/20 shadow-lg">
      <div className="container mx-auto px-4 flex items-center justify-between h-16">
        <Link to="/" className="text-2xl font-bold text-yellow-400 tracking-wide">
          🎰 Casino King
        </Link>
        <div className="flex gap-4 text-sm font-medium">
          <Link to="/lobby" className="text-gray-300 hover:text-yellow-400 transition-colors">
            Games
          </Link>
          <Link to="/wallet" className="text-gray-300 hover:text-yellow-400 transition-colors">
            Wallet
          </Link>
          <Link
            to="/login"
            className="px-4 py-1.5 rounded-full border border-yellow-500 text-yellow-400 hover:bg-yellow-500 hover:text-gray-900 transition-all"
          >
            Login
          </Link>
          <Link
            to="/register"
            className="px-4 py-1.5 rounded-full bg-yellow-500 text-gray-900 font-semibold hover:bg-yellow-400 transition-all"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
}
