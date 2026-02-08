const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');

dotenv.config();

const app = express();
const stripeKey = process.env.STRIPE_SECRET_KEY;
console.log('🔑 Stripe key loaded:', stripeKey ? `${stripeKey.substring(0, 20)}...` : 'MISSING');
const stripeClient = stripe(stripeKey);
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
const twilioClient = twilioAccountSid && twilioAuthToken ? twilio(twilioAccountSid, twilioAuthToken) : null;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (replace with MongoDB in production)
const payments = new Map();
const transactions = [];
const vendors = new Map();
const vendorSessions = new Map();
const users = new Map();
const otpStore = new Map();

const createToken = () => uuidv4();

const requireVendorAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token || !vendorSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const vendorId = vendorSessions.get(token);
  const vendor = vendors.get(vendorId);

  if (!vendor) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.vendor = vendor;
  next();
};

const buildVendorQr = async (vendorId) => {
  const vendorPaymentUrl = `${process.env.FRONTEND_URL}/pay-vendor/${vendorId}`;
  const vendorQRCode = await QRCode.toDataURL(vendorPaymentUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' }
  });

  return { vendorPaymentUrl, vendorQRCode };
};

const buildUserQr = async (userId) => {
  const userPaymentUrl = `${process.env.FRONTEND_URL}/pay-user/${userId}`;
  const userQRCode = await QRCode.toDataURL(userPaymentUrl, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' }
  });

  return { userPaymentUrl, userQRCode };
};

const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

const maskPhone = (phone = '') => {
  const trimmed = phone.replace(/\s+/g, '');
  if (trimmed.length <= 4) {
    return trimmed.replace(/\d/g, '*');
  }
  return `${'*'.repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
};

const sendOtpSms = async ({ phone, purpose }) => {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  otpStore.set(phone, { code, expiresAt, purpose });

  if (!twilioClient || !twilioFromNumber) {
    return { sent: false, mocked: true, code, expiresAt };
  }

  await twilioClient.messages.create({
    body: `Your Street Wallet code is ${code}. Valid for 10 minutes.`,
    from: twilioFromNumber,
    to: phone
  });

  return { sent: true, mocked: false, expiresAt };
};

const maybeSendOtp = async (phone, purpose) => {
  if (!phone) {
    return { otpSent: false };
  }

  try {
    const result = await sendOtpSms({ phone, purpose });
    return {
      otpSent: true,
      otpPhoneMasked: maskPhone(phone),
      otpTestCode: result.mocked && process.env.NODE_ENV !== 'production' ? result.code : undefined
    };
  } catch (error) {
    console.error('Error sending OTP:', error);
    return { otpSent: false, otpError: 'Failed to send OTP' };
  }
};

// Generate QR Code for Payment
app.post('/api/payment/generate', async (req, res) => {
  try {
    const { amount, currency = 'usd', description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Create payment intent
    const paymentId = uuidv4();
    const paymentData = {
      id: paymentId,
      amount,
      currency,
      description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
    };

    payments.set(paymentId, paymentData);

    // Generate payment URL
    const paymentUrl = `${process.env.FRONTEND_URL}/pay/${paymentId}`;

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      payment: {
        id: paymentId,
        amount,
        currency,
        description,
        paymentUrl,
        qrCode: qrCodeDataUrl,
        expiresAt: paymentData.expiresAt
      }
    });
  } catch (error) {
    console.error('Error generating payment:', error);
    res.status(500).json({ error: 'Failed to generate payment' });
  }
});

// Vendor Registration (Demo)
app.post('/api/vendor/register', async (req, res) => {
  try {
    const { name, email, password, businessName } = req.body;

    if (!name || !email || !password || !businessName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingVendor = Array.from(vendors.values()).find(v => v.email === email);
    if (existingVendor) {
      return res.status(409).json({ error: 'Vendor already exists' });
    }

    const vendorId = uuidv4();
    const { vendorPaymentUrl, vendorQRCode } = await buildVendorQr(vendorId);
    const vendor = {
      id: vendorId,
      name,
      email,
      password,
      businessName,
      vendorPaymentUrl,
      vendorQRCode,
      createdAt: new Date().toISOString()
    };

    vendors.set(vendorId, vendor);

    const token = createToken();
    vendorSessions.set(token, vendorId);

    res.json({
      success: true,
      token,
      vendor
    });
  } catch (error) {
    console.error('Error registering vendor:', error);
    res.status(500).json({ error: 'Failed to register vendor' });
  }
});

// Vendor Login (Demo)
app.post('/api/vendor/login', (req, res) => {
  try {
    const { email, password } = req.body;

    const vendor = Array.from(vendors.values()).find(v => v.email === email);
    if (!vendor || vendor.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createToken();
    vendorSessions.set(token, vendor.id);

    res.json({
      success: true,
      token,
      vendor
    });
  } catch (error) {
    console.error('Error logging in vendor:', error);
    res.status(500).json({ error: 'Failed to login vendor' });
  }
});

// Vendor Profile
app.get('/api/vendor/profile', requireVendorAuth, (req, res) => {
  res.json({ success: true, vendor: req.vendor });
});

// Public Vendor Info for QR Payment
app.get('/api/vendor/:vendorId/info', (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = vendors.get(vendorId);

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json({
      success: true,
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
        vendorPaymentUrl: vendor.vendorPaymentUrl,
        vendorQRCode: vendor.vendorQRCode
      }
    });
  } catch (error) {
    console.error('Error fetching vendor info:', error);
    res.status(500).json({ error: 'Failed to fetch vendor info' });
  }
});

// Get Payment Details
app.get('/api/payment/:id', (req, res) => {
  try {
    const { id } = req.params;
    const payment = payments.get(id);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Check if expired
    if (new Date(payment.expiresAt) < new Date()) {
      payment.status = 'expired';
    }

    res.json({ success: true, payment });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// Process Payment with Stripe
app.post('/api/payment/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethodId } = req.body;

    const payment = payments.get(id);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed or expired' });
    }

    // Check if expired
    if (new Date(payment.expiresAt) < new Date()) {
      payment.status = 'expired';
      return res.status(400).json({ error: 'Payment expired' });
    }

    // Create Stripe Payment Intent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(payment.amount * 100), // Convert to cents
      currency: payment.currency,
      payment_method: paymentMethodId,
      confirm: true,
      description: payment.description,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    });

    // Update payment status
    payment.status = 'completed';
    payment.stripePaymentIntentId = paymentIntent.id;
    payment.completedAt = new Date().toISOString();

    // Store transaction
    transactions.push({
      id: uuidv4(),
      paymentId: id,
      amount: payment.amount,
      currency: payment.currency,
      status: 'completed',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency
      }
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: error.message || 'Failed to process payment' });
  }
});

// Process Payment via Street Wallet (no POS required)
app.post('/api/payment/:id/wallet', async (req, res) => {
  try {
    const { id } = req.params;
    const { payerName, payerPhone, paymentOption } = req.body;
    const payment = payments.get(id);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ error: 'Payment already processed or expired' });
    }

    if (new Date(payment.expiresAt) < new Date()) {
      payment.status = 'expired';
      return res.status(400).json({ error: 'Payment expired' });
    }

    payment.status = 'completed';
    payment.completedAt = new Date().toISOString();
    payment.paymentChannel = 'street_wallet';
    payment.paymentOption = paymentOption || 'wallet_balance';

    const otpStatus = await maybeSendOtp(payerPhone, 'cashout');

    transactions.push({
      id: uuidv4(),
      paymentId: id,
      amount: payment.amount,
      currency: payment.currency,
      status: 'completed',
      timestamp: new Date().toISOString(),
      paymentChannel: 'street_wallet',
      paymentOption: payment.paymentOption,
      customerName: payerName,
      customerPhone: payerPhone,
      otpSent: otpStatus.otpSent,
      otpPhoneMasked: otpStatus.otpPhoneMasked
    });

    res.json({
      success: true,
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paymentOption: payment.paymentOption,
        otpSent: otpStatus.otpSent,
        otpPhoneMasked: otpStatus.otpPhoneMasked,
        otpTestCode: otpStatus.otpTestCode
      }
    });
  } catch (error) {
    console.error('Error processing wallet payment:', error);
    res.status(500).json({ error: 'Failed to process wallet payment' });
  }
});

// Vendor Payment via Card (Permanent QR)
app.post('/api/vendor/:vendorId/payment', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { amount, currency = 'usd', description, paymentMethodId } = req.body;

    const vendor = vendors.get(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!paymentMethodId) {
      return res.status(400).json({ error: 'Payment method required' });
    }

    // Create Stripe Payment Intent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      payment_method: paymentMethodId,
      confirm: true,
      description: `Payment to ${vendor.businessName}: ${description || 'Purchase'}`,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    });

    const platformFee = parseFloat((amount * 0.01).toFixed(2));
    const vendorAmount = parseFloat((amount - platformFee).toFixed(2));

    const transaction = {
      id: uuidv4(),
      vendorId,
      vendorName: vendor.businessName,
      amount,
      currency,
      description,
      status: 'completed',
      timestamp: new Date().toISOString(),
      paymentChannel: 'stripe_card',
      stripePaymentIntentId: paymentIntent.id,
      platformFee,
      vendorAmount
    };

    transactions.push(transaction);

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Error processing vendor card payment:', error);
    res.status(500).json({ error: error.message || 'Failed to process payment' });
  }
});

// Vendor Payment via Street Wallet (Permanent QR)
app.post('/api/vendor/:vendorId/wallet-pay', (req, res) => {
  try {
    const { vendorId } = req.params;
    const { amount, currency = 'usd', description, payerName, payerPhone, paymentOption } = req.body;

    const vendor = vendors.get(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const platformFee = parseFloat((amount * 0.01).toFixed(2));
    const vendorAmount = parseFloat((amount - platformFee).toFixed(2));

    const otpStatus = maybeSendOtp(payerPhone, 'cashout');

    const transaction = {
      id: uuidv4(),
      vendorId,
      vendorName: vendor.businessName,
      amount,
      currency,
      description,
      status: 'completed',
      timestamp: new Date().toISOString(),
      paymentChannel: 'street_wallet',
      paymentOption: paymentOption || 'wallet_balance',
      platformFee,
      vendorAmount,
      customerName: payerName,
      customerPhone: payerPhone
    };

    transactions.push(transaction);

    Promise.resolve(otpStatus).then((status) => {
      res.json({
        success: true,
        transaction: {
          ...transaction,
          otpSent: status.otpSent,
          otpPhoneMasked: status.otpPhoneMasked,
          otpTestCode: status.otpTestCode
        }
      });
    });
  } catch (error) {
    console.error('Error processing vendor wallet payment:', error);
    res.status(500).json({ error: 'Failed to process wallet payment' });
  }
});

// User Registration (Personal QR)
app.post('/api/user/register', async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const userId = uuidv4();
    const { userPaymentUrl, userQRCode } = await buildUserQr(userId);
    const user = {
      id: userId,
      name,
      phone,
      userPaymentUrl,
      userQRCode,
      createdAt: new Date().toISOString()
    };

    users.set(userId, user);

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Public User Info for Transfers
app.get('/api/user/:userId/info', (req, res) => {
  try {
    const { userId } = req.params;
    const user = users.get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        userPaymentUrl: user.userPaymentUrl,
        userQRCode: user.userQRCode
      }
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// User to User Transfer
app.post('/api/user/:userId/transfer', (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, currency = 'usd', note, senderName, senderPhone, paymentOption } = req.body;

    const receiver = users.get(userId);
    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const otpStatus = maybeSendOtp(senderPhone, 'cashout');

    const transfer = {
      id: uuidv4(),
      receiverId: receiver.id,
      receiverName: receiver.name,
      receiverPhone: receiver.phone,
      amount,
      currency,
      note,
      status: 'completed',
      timestamp: new Date().toISOString(),
      paymentChannel: 'street_wallet',
      paymentOption: paymentOption || 'wallet_balance',
      senderName,
      senderPhone
    };

    transactions.push(transfer);

    Promise.resolve(otpStatus).then((status) => {
      res.json({
        success: true,
        transfer: {
          ...transfer,
          otpSent: status.otpSent,
          otpPhoneMasked: status.otpPhoneMasked,
          otpTestCode: status.otpTestCode
        }
      });
    });
  } catch (error) {
    console.error('Error transferring funds:', error);
    res.status(500).json({ error: 'Failed to transfer funds' });
  }
});

// Send OTP (manual)
app.post('/api/otp/send', async (req, res) => {
  try {
    const { phone, purpose = 'cashout' } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone is required' });
    }

    const otpStatus = await maybeSendOtp(phone, purpose);
    res.json({ success: true, ...otpStatus });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP (manual)
app.post('/api/otp/verify', (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and code are required' });
    }

    const record = otpStore.get(phone);
    if (!record) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    if (new Date(record.expiresAt) < new Date()) {
      otpStore.delete(phone);
      return res.status(400).json({ error: 'Code expired' });
    }

    if (record.code !== code) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    otpStore.delete(phone);
    res.json({ success: true, verified: true });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Get All Transactions
app.get('/api/transactions', (req, res) => {
  try {
    res.json({
      success: true,
      transactions: transactions.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    version: '1.0.0',
    timestamp: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 QR Payment Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL}`);
});
