import React, { useState, useEffect, useMemo } from 'react';
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
  const [paymentMode, setPaymentMode] = useState('wallet');
  const [walletOption, setWalletOption] = useState('wallet_balance');
  
  // Customer info
  const [customer, setCustomer] = useState(null);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [saveCard, setSaveCard] = useState(false);
  const [showSavedCards, setShowSavedCards] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'usd',
    description: '',
    phone: '',
    email: '',
    name: ''
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
    fetchVendorInfo();
    // Try to load customer info from localStorage
    const savedCustomerId = localStorage.getItem('customerId');
    if (savedCustomerId) {
      loadCustomerInfo(savedCustomerId);
    }
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

  const loadCustomerInfo = async (customerId) => {
    try {
      const response = await api.get(`/customer/${customerId}`);
      if (response.data.success) {
        setCustomer(response.data.customer);
        setSavedPaymentMethods(response.data.savedPaymentMethods || []);
        if (response.data.savedPaymentMethods && response.data.savedPaymentMethods.length > 0) {
          setShowSavedCards(true);
          // Select default or first card
          const defaultCard = response.data.savedPaymentMethods.find(m => m.isDefault);
          setSelectedPaymentMethod(defaultCard || response.data.savedPaymentMethods[0]);
        }
      }
    } catch (err) {
      console.log('No existing customer found');
    }
  };

  const createOrGetCustomer = async () => {
    try {
      const response = await api.post('/customer/profile', {
        phone: formData.phone,
        email: formData.email,
        name: formData.name
      });
      
      if (response.data.success) {
        setCustomer(response.data.customer);
        setSavedPaymentMethods(response.data.savedPaymentMethods || []);
        localStorage.setItem('customerId', response.data.customer.id);
        return response.data.customer;
      }
    } catch (err) {
      console.error('Error creating customer:', err);
      return null;
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmitWithSavedCard = async (e) => {
    e.preventDefault();
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const response = await api.post(`/vendor/${vendorId}/payment-with-saved-method`, {
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        description: formData.description,
        customerId: customer.id,
        paymentMethodId: selectedPaymentMethod.id
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
      // Create or get customer profile if saving card or customer info provided
      let currentCustomer = customer;
      if (saveCard || (formData.phone || formData.email)) {
        if (!currentCustomer) {
          currentCustomer = await createOrGetCustomer();
        }
      }

      // Create payment method
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
        billing_details: {
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          name: formData.name || undefined
        }
      });

      if (stripeError) {
        setError(stripeError.message);
        setProcessing(false);
        return;
      }

      // Save payment method if requested
      if (saveCard && currentCustomer) {
        try {
          await api.post(`/customer/${currentCustomer.id}/payment-method`, {
            paymentMethodId: paymentMethod.id,
            setAsDefault: savedPaymentMethods.length === 0
          });
        } catch (saveError) {
          console.error('Error saving payment method:', saveError);
          // Continue with payment even if saving fails
        }
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
        
        // Reload customer info to get updated saved cards
        if (currentCustomer && saveCard) {
          loadCustomerInfo(currentCustomer.id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleWalletPay = async (e) => {
    e.preventDefault();

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const response = await api.post(`/vendor/${vendorId}/wallet-pay`, {
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        description: formData.description,
        payerName: formData.name,
        payerPhone: formData.phone,
        paymentOption: walletOption
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

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading-spinner"></div>
          <p style={{ textAlign: 'center', marginTop: '1rem' }}>Loading payment page...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="container">
        <div className="card">
          <div className="alert alert-error">
            {error || 'Vendor not found'}
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

            {transaction?.otpSent && (
              <div className="detail-row">
                <span className="detail-label">Cash-out Code:</span>
                <span className="detail-value">
                  Sent to {transaction?.otpPhoneMasked || 'your phone'}
                  {transaction?.otpTestCode ? ` (Test: ${transaction.otpTestCode})` : ''}
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
              onClick={() => window.location.href = '/vendor/dashboard'}
              className="button button-secondary"
            >
              ← Back to Dashboard
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="button button-primary"
            >
              Make Another Payment
            </button>
          </div>
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

        {/* Show saved payment methods if available */}
        {paymentMode === 'card' && customer && savedPaymentMethods.length > 0 && (
          <div className="saved-cards-section">
            <div className="section-header">
              <h3>Saved Payment Methods</h3>
              <button 
                type="button"
                onClick={() => setShowSavedCards(!showSavedCards)}
                className="button button-link"
              >
                {showSavedCards ? 'Use New Card' : 'Use Saved Card'}
              </button>
            </div>

            {showSavedCards && (
              <div className="saved-cards-list">
                {savedPaymentMethods.map((method) => (
                  <div 
                    key={method.id}
                    className={`saved-card-item ${selectedPaymentMethod?.id === method.id ? 'selected' : ''}`}
                    onClick={() => setSelectedPaymentMethod(method)}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={selectedPaymentMethod?.id === method.id}
                      onChange={() => setSelectedPaymentMethod(method)}
                    />
                    <div className="card-info">
                      <span className="card-brand">{method.brand.toUpperCase()}</span>
                      <span className="card-number">•••• {method.last4}</span>
                      <span className="card-exp">{method.expMonth}/{method.expYear}</span>
                    </div>
                    {method.isDefault && <span className="badge badge-info">Default</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={paymentMode === 'wallet' ? handleWalletPay : (showSavedCards && selectedPaymentMethod ? handleSubmitWithSavedCard : handleSubmit)} className="payment-form">
          {/* Customer Information Section */}
          {!customer && (
            <div className="customer-info-section">
              <h3>Your Information (Optional)</h3>
              <p className="info-note">Provide your details to save payment methods for faster checkout next time</p>
              
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  className="input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                    className="input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1234567890"
                    className="input"
                  />
                </div>
              </div>
            </div>
          )}

          {customer && (
            <div className="customer-badge">
              👤 Welcome back, {customer.name || customer.email || 'Customer'}
            </div>
          )}

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
                <option value="aed">AED</option>
                <option value="egp">EGP</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Payment Mode</label>
            <div className="payment-mode-toggle">
              <label className="radio-label">
                <input
                  type="radio"
                  name="paymentMode"
                  value="card"
                  checked={paymentMode === 'card'}
                  onChange={() => setPaymentMode('card')}
                />
                <span>Card (POS-style)</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="paymentMode"
                  value="wallet"
                  checked={paymentMode === 'wallet'}
                  onChange={() => setPaymentMode('wallet')}
                />
                <span>Street Wallet (No POS)</span>
              </label>
            </div>
          </div>

          {paymentMode === 'wallet' && (
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
              <p className="small-hint">Choose the option available on your phone to send money instantly.</p>
            </div>
          )}

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

          {/* Show card element only if not using saved card */}
          {paymentMode === 'card' && (!showSavedCards || !selectedPaymentMethod) && (
            <>
              <div className="form-group">
                <label>Card Details *</label>
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

              {/* Save card checkbox */}
              {(formData.email || formData.phone || customer) && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                    />
                    <span>Save this card for future payments</span>
                  </label>
                </div>
              )}
            </>
          )}

          {formData.amount && (
            <div className="payment-preview">
              <div className="preview-row">
                <span className="preview-label">Payment Amount:</span>
                <span className="preview-amount">
                  {formatCurrency(parseFloat(formData.amount), formData.currency)}
                </span>
              </div>
              <div className="preview-row small">
                <span className="preview-label">Platform Fee (1%):</span>
                <span className="preview-value">
                  {formatCurrency(parseFloat(formData.amount) * 0.01, formData.currency)}
                </span>
              </div>
              <div className="preview-row small">
                <span className="preview-label">Vendor Receives:</span>
                <span className="preview-value">
                  {formatCurrency(parseFloat(formData.amount) * 0.99, formData.currency)}
                </span>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={paymentMode === 'card' ? (!stripe || processing || (showSavedCards && !selectedPaymentMethod && savedPaymentMethods.length > 0)) : processing}
            className="button button-primary button-pay"
          >
            {processing ? 'Processing...' : `Pay ${formatCurrency(parseFloat(formData.amount) || 0, formData.currency)}`}
          </button>
        </form>

        <div className="security-badge">
          🔒 Secured by Stripe • Your payment information is encrypted
        </div>
      </div>
    </div>
  );
}

export default VendorPaymentPage;
