import { Routes, Route, Navigate } from 'react-router-dom';
import AppProviders from './providers/AccountProvider.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ScrollRestoration from './components/ScrollRestoration.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AppShell from './layout/AppShell.jsx';
import Home from './pages/Home.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import WalletPage from './pages/WalletPage.jsx';
import WithdrawPage from './pages/WithdrawPage.jsx';
import BetHistoryPage from './pages/BetHistoryPage.jsx';
import CasinoPage from './pages/CasinoPage.jsx';
import DicePage from './pages/games/DicePage.jsx';
import Spin2WinPage from './pages/games/Spin2WinPage.jsx';
import RedBlackPage from './pages/games/RedBlackPage.jsx';
import VirtualsPage from './pages/VirtualsPage.jsx';
import JackpotPage from './pages/JackpotPage.jsx';
import PromosPage from './pages/PromosPage.jsx';
import InfoPage from './pages/InfoPage.jsx';
import HelpPage from './pages/HelpPage.jsx';

import { AdminProvider, AdminGuard } from './providers/AdminProvider.jsx';
import AdminShell from './layout/AdminShell.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminSignup from './pages/admin/AdminSignup.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminUsers from './pages/admin/Users.jsx';
import AdminStages from './pages/admin/Stages.jsx';
import AdminBets from './pages/admin/Bets.jsx';
import AdminSports from './pages/admin/Sports.jsx';
import AdminPromotions from './pages/admin/Promotions.jsx';
import AdminStats from './pages/admin/Stats.jsx';
import AdminProviders from './pages/admin/Providers.jsx';
import AdminHealth from './pages/admin/Health.jsx';
import AdminDeposits from './pages/admin/Deposits.jsx';
import {
  LiveBettingPage, AuditLogsPage, SettingsPage,
  FinancePage, NotificationsPage, SupportPage, FraudPage,
} from './pages/admin/Stubs.jsx';

function AdminApp() {
  return (
    <AdminProvider>
      <Routes>
        {/* /admin/login redirects to the unified login (preserves bookmarks + AdminGuard back-compat) */}
        <Route path="login"  element={<Navigate to="/login?next=/admin" replace />} />
        <Route path="signup" element={<AdminSignup />} />
        <Route element={<AdminGuard><AdminShell /></AdminGuard>}>
          <Route index               element={<AdminDashboard />} />
          <Route path="users"        element={<AdminUsers />} />
          <Route path="stages"       element={<AdminStages />} />
          <Route path="bets"         element={<AdminBets />} />
          <Route path="live"         element={<LiveBettingPage />} />
          <Route path="sports"       element={<AdminSports />} />
          <Route path="promotions"   element={<AdminPromotions />} />
          <Route path="finance"      element={<FinancePage />} />
          <Route path="deposits"     element={<AdminDeposits />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="support"      element={<SupportPage />} />
          <Route path="analytics"    element={<AdminStats />} />
          <Route path="fraud"        element={<FraudPage />} />
          <Route path="audit"        element={<AuditLogsPage />} />
          <Route path="providers"    element={<AdminProviders />} />
          <Route path="health"       element={<AdminHealth />} />
          <Route path="settings"     element={<SettingsPage />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ScrollRestoration />
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={
          <AppProviders>
            <Routes>
              <Route path="/login"            element={<LoginPage />} />
              <Route path="/verify"           element={<Navigate to="/login" replace />} />
              <Route path="/forgot-password"  element={<Navigate to="/login" replace />} />
              <Route path="/reset-password"   element={<Navigate to="/login" replace />} />
              <Route element={<AppShell />}>
                <Route path="/"          element={<Home />} />
                <Route path="/live"      element={<Home initialChip="live" />} />
                <Route path="/my-bets"   element={<BetHistoryPage />} />
                <Route path="/casino"             element={<CasinoPage />} />
                <Route path="/casino/dice"        element={<DicePage />} />
                <Route path="/casino/spin2win"    element={<Spin2WinPage />} />
                <Route path="/casino/red-black"   element={<RedBlackPage />} />
                <Route path="/virtuals"  element={<VirtualsPage />} />
                <Route path="/jackpot"   element={<JackpotPage />} />
                <Route path="/promos"    element={<PromosPage />} />
                <Route path="/profile"   element={<ProfilePage />} />
                <Route path="/wallet"    element={<WalletPage />} />
                <Route path="/withdraw"  element={<WithdrawPage />} />
                <Route path="/info"      element={<InfoPage />} />
                <Route path="/terms"     element={<Navigate to="/info#terms" replace />} />
                <Route path="/privacy"   element={<Navigate to="/info#privacy" replace />} />
                <Route path="/responsible-gaming" element={<Navigate to="/info#responsible-gaming" replace />} />
                <Route path="/licence"   element={<Navigate to="/info#licence" replace />} />
                <Route path="/help"      element={<HelpPage />} />
                <Route path="/contact"   element={<Navigate to="/help" replace />} />
                <Route path="*"          element={<NotFoundPage />} />
              </Route>
            </Routes>
          </AppProviders>
        } />
      </Routes>
    </ErrorBoundary>
  );
}
