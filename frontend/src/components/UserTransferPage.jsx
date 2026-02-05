import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api';

function UserTransferPage() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [receiver, setReceiver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [transfer, setTransfer] = useState(null);
  const [walletOption, setWalletOption] = useState('wallet_balance');

  const [formData, setFormData] = useState({
    amount: '',
    currency: 'usd',
    note: '',
    senderName: '',
    senderPhone: ''
  });

  const availableWalletOptions = useMemo(() => {
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const options = [
      { id: 'wallet_balance', label: 'Street Wallet Balance' },
      { id: 'bank_transfer', label: 'Bank Transfer' }
    ];

    if (isIOS) {
      options.unshift({ id: 'apple_pay', label: 'Apple Pay (if enabled)' });
    } else if (isAndroid) {
      options.unshift({ id: 'google_pay', label: 'Google Pay (if enabled)' });
    }

    return options;
  }, []);

  useEffect(() => {
    const fetchReceiver = async () => {
      try {
        const response = await api.get(`/user/${userId}/info`);
        if (response.data.success) {
          setReceiver(response.data.user);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Receiver not found');
      } finally {
        setLoading(false);
      }
    };

    fetchReceiver();
  }, [userId]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const response = await api.post(`/user/${userId}/transfer`, {
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        note: formData.note,
        senderName: formData.senderName,
        senderPhone: formData.senderPhone,
        paymentOption: walletOption
      });

      if (response.data.success) {
        setSuccess(true);
        setTransfer(response.data.transfer);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Transfer failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading">Loading receiver info...</div>
        </div>
      </div>
    );
  }

  if (!receiver) {
    return (
      <div className="container">
        <div className="card">
          <div className="alert alert-error">Receiver not found</div>
          <button onClick={() => navigate('/')} className="button button-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container">
        <div className="card">
          <div className="success-icon">✓</div>
          <h2 className="card-title">Transfer Successful!</h2>

          <div className="payment-details">
            <div className="detail-row">
              <span className="detail-label">Sent To:</span>
              <span className="detail-value">{transfer?.receiverName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Amount:</span>
              <span className="detail-value success">
                {formatCurrency(transfer?.amount, transfer?.currency)}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Transfer ID:</span>
              <span className="detail-value mono">{transfer?.id}</span>
            </div>

            {transfer?.otpSent && (
              <div className="detail-row">
                <span className="detail-label">Cash-out Code:</span>
                <span className="detail-value">
                  Sent to {transfer?.otpPhoneMasked || 'your phone'}
                  {transfer?.otpTestCode ? ` (Test: ${transfer.otpTestCode})` : ''}
                </span>
              </div>
            )}
          </div>

          <button onClick={() => window.location.reload()} className="button button-primary">
            Send Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="vendor-payment-header">
          <div className="vendor-icon">👤</div>
          <h2 className="card-title">Send Money to {receiver.name}</h2>
          <p className="vendor-subtitle">Scan & send money instantly</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="payment-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="senderName">Your Name</label>
              <input
                type="text"
                id="senderName"
                name="senderName"
                value={formData.senderName}
                onChange={handleChange}
                placeholder="John Doe"
                className="input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="senderPhone">Your Phone</label>
              <input
                type="tel"
                id="senderPhone"
                name="senderPhone"
                value={formData.senderPhone}
                onChange={handleChange}
                placeholder="+123456789"
                className="input"
              />
            </div>
          </div>

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
                <option value="aed">AED</option>
                <option value="egp">EGP</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="note">Note (Optional)</label>
            <input
              type="text"
              id="note"
              name="note"
              value={formData.note}
              onChange={handleChange}
              placeholder="Add a note"
              className="input"
            />
          </div>

          <div className="wallet-options">
            <label>Detected Payment Options</label>
            <div className="wallet-options-grid">
              {availableWalletOptions.map((option) => (
                <label key={option.id} className="radio-label">
                  <input
                    type="radio"
                    name="walletOption"
                    value={option.id}
                    checked={walletOption === option.id}
                    onChange={() => setWalletOption(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="small-hint">Select the wallet option available on your phone.</p>
          </div>

          <button type="submit" disabled={processing} className="button button-primary button-pay">
            {processing ? 'Processing...' : `Send ${formatCurrency(parseFloat(formData.amount) || 0, formData.currency)}`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UserTransferPage;
