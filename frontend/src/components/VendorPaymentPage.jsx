import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { api } from '../utils/api';

function VendorPaymentPage() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [transaction, setTransaction] = useState(null);
  
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'usd',
    description: ''
  });

  useEffect(() => {
    fetchVendorInfo();
  }, [vendorId]);

  const fetchVendorInfo = async () => {
    try {
      const response = await api.get(`/vendor/${vendorId}/info`);
      if (response.data.success) {
        setVendor(response.data.vendor);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Vendor not found');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Create payment method
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
      });

      if (stripeError) {
        setError(stripeError.message);
        setProcessing(false);
        return;
      }

      // Process payment to vendor
      const response = await api.post(`/vendor/${vendorId}/payment`, {
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        description: formData.description,
        paymentMethodId: paymentMethod.id
      });

      if (response.data.success) {
        setSuccess(true);
        setTransaction(response.data.transaction);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
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
          <div className="loading">Loading vendor information...</div>
        </div>
      </div>
    );
  }

  if (!vendor && !loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="alert alert-error">
            Vendor not found
          </div>
          <button 
            onClick={() => navigate('/')}
            className="button button-primary"
          >
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
          <h2 className="card-title">Payment Successful!</h2>
          
          <div className="payment-details">
            <div className="detail-row">
              <span className="detail-label">Paid To:</span>
              <span className="detail-value">{transaction?.vendorName}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Amount Paid:</span>
              <span className="detail-value success">
                {formatCurrency(transaction?.amount, transaction?.currency)}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Transaction ID:</span>
              <span className="detail-value mono">{transaction?.id}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="badge badge-success">{transaction?.status}</span>
            </div>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="button button-primary"
          >
            Make Another Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="vendor-payment-header">
          <div className="vendor-icon">🏪</div>
          <h2 className="card-title">Pay to {vendor.businessName}</h2>
          <p className="vendor-subtitle">Enter amount and complete payment</p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="payment-form">
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
                className="input input-amount"
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
            <label htmlFor="description">Note (Optional)</label>
            <input
              type="text"
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="What's this payment for?"
              className="input"
            />
          </div>

          <div className="form-group">
            <label>Card Details</label>
            <div className="card-element-container">
              <CardElement 
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#333',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                    invalid: {
                      color: '#e74c3c',
                    },
                  },
                }}
              />
            </div>
          </div>

          {formData.amount && (
            <div className="payment-preview">
              <div className="preview-label">You will pay:</div>
              <div className="preview-amount">
                {formatCurrency(parseFloat(formData.amount), formData.currency)}
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={!stripe || processing}
            className="button button-primary button-pay"
          >
            {processing ? 'Processing...' : `Pay ${vendor.businessName}`}
          </button>
        </form>

        <div className="security-badge">
          🔒 Secured by Stripe
        </div>
      </div>
    </div>
  );
}

export default VendorPaymentPage;
