import React, { useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, Crown, LogOut, Menu, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Sidebar from './Sidebar.jsx';

const navItems = [
  { to: '/', label: 'Lobby' },
  { to: '/games/slots', label: 'Games' },
  { to: '/leaderboard', label: 'Leaderboard' },
];

function navClassName({ isActive }) {
  return isActive ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400';
}

export default function Navbar() {
  const { token, user, wallet, unreadCount, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const vipLabel = useMemo(() => user?.vipTier?.name || user?.vipTier || 'Bronze', [user]);

  return (
    <>
      <nav className="border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-yellow-400">Casino King</Link>
            <div className="hidden items-center gap-4 text-sm font-medium md:flex">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={navClassName}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {token ? (
              <>
                <div className="rounded-full border border-yellow-500/50 bg-yellow-500/10 px-3 py-1 text-sm text-yellow-300">
                  {wallet?.ckcBalance ?? 0} CKC
                </div>
                <button className="relative rounded-full border border-gray-700 p-2 text-gray-200 hover:bg-gray-800" aria-label="Notifications">
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-xs text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
                  <Crown size={14} />
                  {vipLabel}
                </div>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-800">
                    <User size={14} />
                    {user?.fullName || 'Account'}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content sideOffset={8} className="z-50 min-w-44 rounded-md border border-gray-800 bg-gray-900 p-1 shadow-xl">
                      <DropdownMenu.Item asChild>
                        <Link className="block rounded px-3 py-2 text-sm text-gray-200 hover:bg-gray-800" to="/profile">Profile</Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <Link className="block rounded px-3 py-2 text-sm text-gray-200 hover:bg-gray-800" to="/wallet">Wallet</Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item asChild>
                        <Link className="block rounded px-3 py-2 text-sm text-gray-200 hover:bg-gray-800" to="/responsible">Settings</Link>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="my-1 h-px bg-gray-800" />
                      <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-red-300 hover:bg-gray-800" onSelect={logout}>
                        <LogOut size={14} />
                        Logout
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-full border border-yellow-500 px-4 py-1.5 text-sm text-yellow-400 hover:bg-yellow-500/10">Login</Link>
                <Link to="/register" className="rounded-full bg-yellow-500 px-4 py-1.5 text-sm font-semibold text-gray-900 hover:bg-yellow-400">Register</Link>
              </>
            )}
          </div>

          <button className="rounded-md p-2 text-gray-300 md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
        </div>
      </nav>
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} user={user} wallet={wallet} />
    </>
  );
}
