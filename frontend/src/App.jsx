import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import VendorLogin from './components/VendorLogin';
import VendorRegister from './components/VendorRegister';
import VendorDashboard from './components/VendorDashboard';
import VendorPaymentPage from './components/VendorPaymentPage';
import UserQRCode from './components/UserQRCode';
import UserTransferPage from './components/UserTransferPage';
import GeneratePayment from './components/GeneratePayment';
import PaymentPage from './components/PaymentPage';
import TransactionList from './components/TransactionList';
import './App.css';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// Protected Route Component
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  return isAuthenticated ? children : <Navigate to="/vendor/login" />;
}

// Public Route (redirect if already logged in)
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  
  return !isAuthenticated ? children : <Navigate to="/vendor/dashboard" />;
}

function AppContent() {
  const { isAuthenticated, vendor, logout } = useAuth();

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <h1 className="nav-title">💳 QR Payment System</h1>
          <div className="nav-links">
            {isAuthenticated ? (
              <>
                <Link to="/vendor/dashboard" className="nav-link">Dashboard</Link>
                <Link to="/user/qr" className="nav-link">Personal QR</Link>
                <span className="nav-vendor">👤 {vendor?.businessName}</span>
                <button onClick={logout} className="nav-link nav-logout">Logout</button>
              </>
            ) : (
              <>
                <Link to="/vendor/login" className="nav-link">Login</Link>
                <Link to="/vendor/register" className="nav-link">Register</Link>
                <Link to="/user/qr" className="nav-link">Personal QR</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          {/* Public Routes */}
          <Route path="/vendor/login" element={
            <PublicRoute>
              <VendorLogin />
            </PublicRoute>
          } />
          <Route path="/vendor/register" element={
            <PublicRoute>
              <VendorRegister />
            </PublicRoute>
          } />
          
          {/* Protected Routes */}
          <Route path="/vendor/dashboard" element={
            <ProtectedRoute>
              <VendorDashboard />
            </ProtectedRoute>
          } />
          
          {/* Payment Pages (Public - anyone with QR can pay) */}
          <Route path="/pay/:paymentId" element={<PaymentPage />} />
          <Route path="/pay-vendor/:vendorId" element={<VendorPaymentPage />} />
          <Route path="/pay-user/:userId" element={<UserTransferPage />} />
          <Route path="/user/qr" element={<UserQRCode />} />
          
          {/* Redirect root to login or dashboard */}
          <Route path="/" element={
            isAuthenticated ? <Navigate to="/vendor/dashboard" /> : <Navigate to="/vendor/login" />
          } />
        </Routes>
      </main>

      <footer className="footer">
        <p>© 2026 QR Payment System | Secure Vendor Payments</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Elements stripe={stripePromise}>
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </Elements>
  );
}

export default App;
