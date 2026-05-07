import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function PrivateRoute({ children, requireKyc = false, requireRole }) {
  const { token, user } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (requireKyc && user?.kycStatus !== 'APPROVED') {
    return <Navigate to="/kyc" replace />;
  }

  if (requireRole) {
    const roles = Array.isArray(requireRole) ? requireRole : [requireRole];

    if (!roles.includes(user?.role)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
