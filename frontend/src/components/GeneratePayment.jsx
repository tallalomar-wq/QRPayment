import React, { useState } from 'react';
import { api } from '../utils/api';

function GeneratePayment() {
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    currency: 'usd'
  });
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setQrData(null);

    try {
      const response = await api.post('/payment/generate', {
        amount: parseFloat(formData.amount),
        description: formData.description,
        currency: formData.currency
      });

      if (response.data.success) {
        setQrData(response.data.payment);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate payment');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({ amount: '', description: '', currency: 'usd' });
    setQrData(null);
    setError('');
  };

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  };

  return (
    <div className="container">
      <div className="card">
        <h2 className="card-title">🎫 Generate Payment QR Code</h2>
        
        {!qrData ? (
          <form onSubmit={handleSubmit} className="form">
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
                <option value="usd">USD - US Dollar</option>
                <option value="eur">EUR - Euro</option>
                <option value="gbp">GBP - British Pound</option>
                <option value="jpy">JPY - Japanese Yen</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Payment description (optional)"
                rows="3"
                className="input"
              />
            </div>

            {error && (
              <div className="alert alert-error">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="button button-primary"
            >
              {loading ? 'Generating...' : 'Generate QR Code'}
            </button>
          </form>
        ) : (
          <div className="qr-result">
            <div className="qr-code-container">
              <img 
                src={qrData.qrCode} 
                alt="Payment QR Code" 
                className="qr-code"
              />
            </div>

            <div className="payment-details">
              <div className="detail-row">
                <span className="detail-label">Amount:</span>
                <span className="detail-value">{formatCurrency(qrData.amount, qrData.currency)}</span>
              </div>
              
              {qrData.description && (
                <div className="detail-row">
                  <span className="detail-label">Description:</span>
                  <span className="detail-value">{qrData.description}</span>
                </div>
              )}
              
              <div className="detail-row">
                <span className="detail-label">Payment ID:</span>
                <span className="detail-value mono">{qrData.id}</span>
              </div>
              
              <div className="detail-row">
                <span className="detail-label">Expires:</span>
                <span className="detail-value">
                  {new Date(qrData.expiresAt).toLocaleString()}
                </span>
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
                onClick={handleReset}
                className="button button-primary"
              >
                Generate New
              </button>
            </div>

            <div className="info-box">
              <p>📱 Scan this QR code with your mobile device to complete the payment.</p>
              <p>⏱️ This QR code will expire in 15 minutes.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GeneratePayment;
