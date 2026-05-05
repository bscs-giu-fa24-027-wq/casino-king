import React from 'react';

export default function WalletPage() {
  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-yellow-400 mb-8">My Wallet</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <p className="text-gray-400 text-center">
          Connect your account to view your balance and transactions.
        </p>
      </div>
    </div>
  );
}
