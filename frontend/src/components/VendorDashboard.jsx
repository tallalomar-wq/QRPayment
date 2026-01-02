import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

function VendorDashboard() {
  const { vendor, token, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalRevenue: 0,
    pendingPayments: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    currency: 'usd'
  });
  const [qrData, setQrData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await api.get('/transactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        const txns = response.data.transactions;
        setTransactions(txns);
        
        // Calculate stats
        const total = txns.reduce((sum, t) => sum + t.amount, 0);
        setStats({
          totalTransactions: txns.length,
          totalRevenue: total,
          pendingPayments: 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleGenerateQR = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await api.post('/payment/generate', {
        amount: parseFloat(formData.amount),
        description: formData.description,
        currency: formData.currency
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setQrData(response.data.payment);
        setFormData({ amount: '', description: '', currency: 'usd' });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate QR code');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/vendor/login');
  };

  const formatCurrency = (amount, currency = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="vendor-dashboard">
      <div className="dashboard-header">
        <div className="vendor-info">
          <h1>👋 Welcome, {vendor?.businessName}</h1>
          <p className="vendor-email">{vendor?.email}</p>
        </div>
        <button onClick={handleLogout} className="button button-secondary">
          Logout
        </button>
      </div>

      {/* Permanent Vendor QR Code */}
      <div className="card permanent-qr-section">
        <h3 className="section-title">📱 Your Payment QR Code</h3>
        <p className="qr-description">
          This is your permanent payment QR code. Share it with customers - they can scan it and send you any amount!
        </p>
        <div className="permanent-qr-display">
          <div className="qr-code-container">
            <img src={vendor?.vendorQRCode} alt="Vendor Payment QR Code" className="qr-code" />
          </div>
          <div className="qr-info">
            <div className="info-card">
              <div className="info-icon">🏪</div>
              <div>
                <div className="info-label">Business Name</div>
                <div className="info-value">{vendor?.businessName}</div>
              </div>
            </div>
            <div className="info-card">
              <div className="info-icon">🔗</div>
              <div>
                <div className="info-label">Payment Link</div>
                <div className="info-value mono small">{vendor?.vendorPaymentUrl}</div>
              </div>
            </div>
            <button 
              onClick={() => window.open(vendor?.vendorPaymentUrl, '_blank')}
              className="button button-primary"
            >
              Open Payment Link
            </button>
            <p className="qr-tip">💡 Print this QR code and display it at your store!</p>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-label">Total Transactions</div>
            <div className="stat-value">{stats.totalTransactions}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <div className="stat-label">Pending Payments</div>
            <div className="stat-value">{stats.pendingPayments}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-actions">
        <button 
          onClick={() => {
            setShowGenerateForm(!showGenerateForm);
            setQrData(null);
          }}
          className="button button-primary"
        >
          {showGenerateForm ? '❌ Cancel' : '➕ Generate New QR Code'}
        </button>
      </div>

      {showGenerateForm && !qrData && (
        <div className="card">
          <h3 className="section-title">Generate Payment QR Code</h3>
          <form onSubmit={handleGenerateQR} className="form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="amount">Amount *</label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  required
                  className="input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="currency">Currency</label>
                <select
                  id="currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                  <option value="gbp">GBP</option>
                  <option value="jpy">JPY</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <input
                type="text"
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Payment description"
                className="input"
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="button button-primary">
              Generate QR Code
            </button>
          </form>
        </div>
      )}

      {qrData && (
        <div className="card qr-result">
          <h3 className="section-title">✅ QR Code Generated</h3>
          <div className="qr-display">
            <img src={qrData.qrCode} alt="Payment QR Code" className="qr-code" />
            <div className="qr-details">
              <p><strong>Amount:</strong> {formatCurrency(qrData.amount, qrData.currency)}</p>
              <p><strong>Description:</strong> {qrData.description || 'N/A'}</p>
              <p><strong>Expires:</strong> {formatDate(qrData.expiresAt)}</p>
            </div>
          </div>
          <div className="qr-actions">
            <button 
              onClick={() => window.open(qrData.paymentUrl, '_blank')}
              className="button button-secondary"
            >
              Open Payment Link
            </button>
            <button 
              onClick={() => {
                setQrData(null);
                setShowGenerateForm(false);
              }}
              className="button button-primary"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="section-title">📋 Recent Transactions</h3>
          <button onClick={fetchTransactions} className="button button-secondary button-sm">
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h4>No Transactions Yet</h4>
            <p>Generate a QR code and receive your first payment!</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.timestamp)}</td>
                    <td className="amount-value">
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </td>
                    <td>
                      <span className={`badge badge-${transaction.status}`}>
                        {transaction.status}
                      </span>
                    </td>
                    <td className="mono">{transaction.paymentId.slice(0, 12)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default VendorDashboard;
