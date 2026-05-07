import React from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import PrivateRoute from './components/PrivateRoute.jsx';
import Navbar from './components/layout/Navbar.jsx';
import AdminPage from './pages/AdminPage.jsx';
import CoinShopPage from './pages/CoinShopPage.jsx';
import DealerPage from './pages/DealerPage.jsx';
import GamePage from './pages/GamePage.jsx';
import KycPage from './pages/KycPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MissionsPage from './pages/MissionsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ResponsibleGamblingPage from './pages/ResponsibleGamblingPage.jsx';
import VipPage from './pages/VipPage.jsx';
import WalletPage from './pages/WalletPage.jsx';

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <Toaster position="top-right" />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/games/:id"
          element={(
            <PrivateRoute>
              <GamePage />
            </PrivateRoute>
          )}
        />
        <Route path="/shop" element={<CoinShopPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/vip" element={<VipPage />} />

        <Route
          path="/wallet"
          element={(
            <PrivateRoute>
              <WalletPage />
            </PrivateRoute>
          )}
        />
        <Route
          path="/kyc"
          element={(
            <PrivateRoute>
              <KycPage />
            </PrivateRoute>
          )}
        />
        <Route
          path="/profile"
          element={(
            <PrivateRoute>
              <ProfilePage />
            </PrivateRoute>
          )}
        />
        <Route
          path="/missions"
          element={(
            <PrivateRoute>
              <MissionsPage />
            </PrivateRoute>
          )}
        />
        <Route
          path="/responsible"
          element={(
            <PrivateRoute>
              <ResponsibleGamblingPage />
            </PrivateRoute>
          )}
        />
        <Route
          path="/dealer"
          element={(
            <PrivateRoute requireRole={['DEALER', 'ADMIN']}>
              <DealerPage />
            </PrivateRoute>
          )}
        />
        <Route
          path="/admin"
          element={(
            <PrivateRoute requireRole="ADMIN">
              <AdminPage />
            </PrivateRoute>
          )}
        />

        <Route path="/lobby" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
