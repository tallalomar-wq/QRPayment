import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { api } from '../utils/api';

function PaymentPage() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPaymentDetails();
  }, [paymentId]);

  const fetchPaymentDetails = async () => {
    try {
      const response = await api.get(`/payment/${paymentId}`);
      if (response.data.success) {
        setPayment(response.data.payment);
        
        if (response.data.payment.status === 'completed') {
          setSuccess(true);
        } else if (response.data.payment.status === 'expired') {
          setError('This payment has expired');
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Payment not found');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
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

      // Process payment
      const response = await api.post(`/payment/${paymentId}/process`, {
        paymentMethodId: paymentMethod.id
      });

      if (response.data.success) {
        setSuccess(true);
        setPayment(response.data.payment);
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
          <div className="loading">Loading payment details...</div>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="container">
        <div className="card">
          <div className="alert alert-error">
            Payment not found
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
              <span className="detail-label">Amount Paid:</span>
              <span className="detail-value success">{formatCurrency(payment.amount, payment.currency)}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Payment ID:</span>
              <span className="detail-value mono">{payment.id}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="badge badge-success">{payment.status}</span>
            </div>
          </div>

          <button 
            onClick={() => navigate('/')}
            className="button button-primary"
          >
            Generate New Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 className="card-title">💳 Complete Payment</h2>
        
        <div className="payment-summary">
          <div className="amount-display">
            {formatCurrency(payment.amount, payment.currency)}
          </div>
          
          {payment.description && (
            <p className="payment-description">{payment.description}</p>
          )}
          
          <div className="payment-info">
            <p className="info-text">
              ⏱️ Expires: {new Date(payment.expiresAt).toLocaleString()}
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="payment-form">
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

          <button 
            type="submit" 
            disabled={!stripe || processing || payment.status !== 'pending'}
            className="button button-primary button-pay"
          >
            {processing ? 'Processing...' : `Pay ${formatCurrency(payment.amount, payment.currency)}`}
          </button>
        </form>

        <div className="security-badge">
          🔒 Secured by Stripe
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;
