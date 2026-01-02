import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

function TransactionList() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await api.get('/transactions');
      if (response.data.success) {
        setTransactions(response.data.transactions);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency) => {
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

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading">Loading transactions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📊 Transaction History</h2>
          <button 
            onClick={fetchTransactions}
            className="button button-secondary button-sm"
          >
            🔄 Refresh
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        {transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No Transactions Yet</h3>
            <p>Your completed payments will appear here.</p>
          </div>
        ) : (
          <div className="transaction-list">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payment ID</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="transaction-date">
                        {formatDate(transaction.timestamp)}
                      </td>
                      <td className="transaction-id">
                        <span className="mono">{transaction.paymentId.slice(0, 8)}...</span>
                      </td>
                      <td className="transaction-amount">
                        <span className="amount-value">
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${transaction.status}`}>
                          {transaction.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="transaction-summary">
              <div className="summary-card">
                <div className="summary-label">Total Transactions</div>
                <div className="summary-value">{transactions.length}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Completed</div>
                <div className="summary-value success">
                  {transactions.filter(t => t.status === 'completed').length}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TransactionList;
