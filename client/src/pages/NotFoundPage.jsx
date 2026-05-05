import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="text-center py-20">
      <h1 className="text-6xl font-extrabold text-yellow-400 mb-4">404</h1>
      <p className="text-xl text-gray-400 mb-8">Page not found.</p>
      <Link
        to="/"
        className="px-8 py-3 bg-yellow-500 text-gray-900 font-bold rounded-full text-lg hover:bg-yellow-400 transition-all"
      >
        Go Home
      </Link>
    </div>
  );
}
