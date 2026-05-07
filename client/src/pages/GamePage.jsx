import React from 'react';
import { useParams } from 'react-router-dom';

export default function GamePage() {
  const { id } = useParams();

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <h1 className="text-2xl font-bold text-yellow-400">Game: {id}</h1>
      <p className="mt-2 text-gray-400">Placeholder for dynamic game component and rules/history integration.</p>
    </section>
  );
}
