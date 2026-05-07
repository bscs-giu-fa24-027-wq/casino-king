import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import { Crown, X } from 'lucide-react';

const NAV_LINKS = [
  { to: '/', label: 'Lobby' },
  { to: '/games/slots', label: 'Games' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/shop', label: 'Coin Shop' },
  { to: '/vip', label: 'VIP' },
  { to: '/missions', label: 'Missions' },
];

export default function Sidebar({ open, onOpenChange, user, wallet }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-80 max-w-full border-l border-gray-800 bg-gray-900 p-6">
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-yellow-400">Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-2 text-gray-300 hover:bg-gray-800 hover:text-white">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <nav className="space-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => onOpenChange(false)}
                className="block rounded-lg px-3 py-2 text-gray-200 hover:bg-gray-800"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {user && (
            <div className="mt-8 rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm">
              <p className="text-gray-400">Balance</p>
              <p className="text-lg font-semibold text-yellow-400">{wallet?.ckcBalance ?? 0} CKC</p>
              <div className="mt-3 flex items-center gap-2 text-gray-300">
                <Crown size={14} />
                <span>{user?.vipTier?.name || 'Bronze'} Tier</span>
              </div>
              <p className="mt-2 text-gray-400">Streak: {user?.loginStreak ?? 0} days</p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
