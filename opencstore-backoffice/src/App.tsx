import React from 'react';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './modules/auth/AuthContext';
import AppRoutes from './routes';

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
