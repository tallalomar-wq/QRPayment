import React, { useState } from 'react';
import { api } from '../utils/api';

function UserQRCode() {
  const [formData, setFormData] = useState({
    name: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

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

    try {
      const response = await api.post('/user/register', {
        name: formData.name.trim(),
        phone: formData.phone.trim()
      });

      if (response.data.success) {
        setUser(response.data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate QR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h2 className="card-title">📱 Create Your Personal QR</h2>
        <p className="subtle-text">
          Share your QR to receive money instantly without POS or bank account.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        {!user && (
          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="name">Your Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                required
                className="input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone Number *</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+123456789"
                required
                className="input"
              />
            </div>

            <button type="submit" disabled={loading} className="button button-primary">
              {loading ? 'Generating...' : 'Generate My QR'}
            </button>
          </form>
        )}

        {user && (
          <div className="qr-result">
            <h3 className="section-title">✅ Your Permanent QR</h3>
            <div className="qr-display">
              <img src={user.userQRCode} alt="User QR" className="qr-code" />
              <div className="qr-details">
                <p><strong>Name:</strong> {user.name}</p>
                <p><strong>Phone:</strong> {user.phone}</p>
                <p className="mono small">{user.userPaymentUrl}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserQRCode;
