# QR Payment System

A complete QR code-based payment system with React frontend and Node.js backend, integrated with Stripe for payment processing.

## Features

✨ **Generate QR Codes** - Create payment QR codes with custom amounts and descriptions  
📱 **Mobile-Friendly** - Scan QR codes with any device to make payments  
💳 **Stripe Integration** - Secure payment processing with Stripe  
📊 **Transaction History** - View all completed payment transactions  
⏱️ **Payment Expiration** - QR codes expire after 15 minutes for security  
🎨 **Modern UI** - Beautiful, responsive design with smooth animations

## Tech Stack

### Backend
- Node.js with Express
- Stripe API for payments
- QRCode library for QR generation
- UUID for unique payment IDs

### Frontend
- React 18
- React Router for navigation
- Stripe Elements for card input
- Axios for API calls
- Vite for fast development

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- Stripe account ([Get one here](https://stripe.com))
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Edit `backend/.env` and add your Stripe secret key:
```env
PORT=5000
FRONTEND_URL=http://localhost:5173
STRIPE_SECRET_KEY=sk_test_your_actual_stripe_secret_key
NODE_ENV=development
```

4. Start the backend server:
```bash
npm run dev
```

Server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Edit `frontend/.env` and add your Stripe publishable key:
```env
VITE_API_URL=http://localhost:5000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_stripe_publishable_key
```

4. Start the development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:5173`

## Getting Stripe API Keys

1. Sign up at [Stripe](https://stripe.com)
2. Go to Developers → API Keys
3. Copy your **Publishable key** and **Secret key**
4. Use **test mode** keys (starting with `pk_test_` and `sk_test_`) for development

## Usage Guide

### 1. Generate a Payment QR Code

- Open the app at `http://localhost:5173`
- Enter payment amount
- Select currency (USD, EUR, GBP, JPY)
- Add optional description
- Click "Generate QR Code"
- QR code is displayed with payment details

### 2. Make a Payment

- Scan the QR code with your mobile device
- Or click "Open Payment Link" to test on same device
- Enter card details (use Stripe test cards)
- Click "Pay" to process payment

### 3. Test Cards

Use these Stripe test cards for development:

- **Successful payment:** 4242 4242 4242 4242
- **Payment declined:** 4000 0000 0000 0002
- **Requires authentication:** 4000 0025 0000 3155

Use any future expiry date, any 3-digit CVC, and any postal code.

### 4. View Transactions

- Click "Transactions" in navigation
- See all completed payments
- View payment details and timestamps

## API Endpoints

### POST `/api/payment/generate`
Generate a new payment QR code
```json
{
  "amount": 29.99,
  "currency": "usd",
  "description": "Product purchase"
}
```

### GET `/api/payment/:id`
Get payment details by ID

### POST `/api/payment/:id/process`
Process a payment with Stripe
```json
{
  "paymentMethodId": "pm_xxx"
}
```

### GET `/api/transactions`
Get all transaction history

### GET `/health`
Health check endpoint

## Project Structure

```
QRPayment/
├── backend/
│   ├── server.js          # Express server
│   ├── package.json       # Backend dependencies
│   └── .env              # Backend config
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── GeneratePayment.jsx
│   │   │   ├── PaymentPage.jsx
│   │   │   └── TransactionList.jsx
│   │   ├── utils/
│   │   │   └── api.js    # Axios configuration
│   │   ├── App.jsx       # Main app component
│   │   ├── App.css       # Styles
│   │   ├── main.jsx      # Entry point
│   │   └── index.css     # Global styles
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env             # Frontend config
└── README.md
```

## Security Notes

⚠️ **Important for Production:**
- Store Stripe keys in secure environment variables
- Use MongoDB or PostgreSQL instead of in-memory storage
- Implement proper authentication and authorization
- Add rate limiting to prevent abuse
- Use HTTPS for all communications
- Validate all inputs on backend
- Implement webhook handlers for Stripe events
- Add proper error logging and monitoring

## Troubleshooting

### "Payment Intent creation failed"
- Check if your Stripe secret key is correct
- Ensure you're using test mode keys
- Verify amount is greater than 0

### "CORS Error"
- Ensure backend is running on port 5000
- Check FRONTEND_URL in backend .env matches frontend URL

### QR Code not scanning
- Ensure QR code is displayed clearly
- Try using a different QR scanner app
- Check network connectivity

### Transactions not showing
- Verify backend is running
- Check browser console for errors
- Ensure payment was completed successfully

## Future Enhancements

- [ ] Add MongoDB for persistent storage
- [ ] Implement user authentication
- [ ] Add webhook handlers for Stripe events
- [ ] Support multiple payment methods
- [ ] Add email receipts
- [ ] Implement refund functionality
- [ ] Add payment analytics dashboard
- [ ] Support for multiple currencies
- [ ] Mobile app version

## License

ISC

## Support

For issues or questions:
- Check Stripe documentation: https://stripe.com/docs
- Review error messages in browser console
- Check server logs for backend errors

---

Built with ❤️ using React, Node.js, and Stripe
