const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (replace with MongoDB in production)
const vendors = new Map(); // Store vendors: { id, name, email, password, businessName }
const payments = new Map();
const transactions = [];
const customers = new Map(); // Store customers: { id, phone, email, stripeCustomerId, savedPaymentMethods }
const customerPaymentMethods = new Map(); // Store payment methods by customer

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.vendorId = decoded.vendorId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Vendor Registration
app.post('/api/vendor/register', async (req, res) => {
  try {
    const { name, email, password, businessName } = req.body;
    
    if (!name || !email || !password || !businessName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if vendor exists
    for (const vendor of vendors.values()) {
      if (vendor.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const vendorId = uuidv4();
    
    // Generate permanent vendor payment URL
    const vendorPaymentUrl = `${process.env.FRONTEND_URL}/pay-vendor/${vendorId}`;
    
    // Generate permanent QR code for vendor
    const vendorQRCode = await QRCode.toDataURL(vendorPaymentUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    const vendor = {
      id: vendorId,
      name,
      email,
      password: hashedPassword,
      businessName,
      vendorPaymentUrl,
      vendorQRCode,
      createdAt: new Date().toISOString()
    };
    
    vendors.set(vendorId, vendor);
    
    // Generate token
    const token = jwt.sign({ vendorId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      vendor: {
        id: vendorId,
        name,
        email,
        businessName,
        vendorPaymentUrl,
        vendorQRCode
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Vendor Login
app.post('/api/vendor/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find vendor
    let foundVendor = null;
    for (const vendor of vendors.values()) {
      if (vendor.email === email) {
        foundVendor = vendor;
        break;
      }
    }
    
    if (!foundVendor) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, foundVendor.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign({ vendorId: foundVendor.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      vendor: {
        id: foundVendor.id,
        name: foundVendor.name,
        email: foundVendor.email,
        businessName: foundVendor.businessName
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get Vendor Profile
app.get('/api/vendor/profile', authMiddleware, (req, res) => {
  try {
    const vendor = vendors.get(req.vendorId);
    
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json({
      success: true,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        businessName: vendor.businessName,
        vendorPaymentUrl: vendor.vendorPaymentUrl,
        vendorQRCode: vendor.vendorQRCode
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get Vendor Info by ID (Public - for QR scanning)
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
        email: vendor.email
      }
    });
  } catch (error) {
    console.error('Vendor info error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor info' });
  }
});

// Create Payment to Vendor (Public - from vendor QR scan)
app.post('/api/vendor/:vendorId/payment', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { amount, currency = 'usd', description, paymentMethodId } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    const vendor = vendors.get(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    // Calculate 1% platform fee
    const platformFee = amount * 0.01;
    const vendorAmount = amount - platformFee;
    
    // Create Stripe Payment Intent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      payment_method: paymentMethodId,
      confirm: true,
      description: description || `Payment to ${vendor.businessName}`,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    });
    
    // Store transaction
    const transactionId = uuidv4();
    transactions.push({
      id: transactionId,
      paymentId: transactionId,
      vendorId: vendorId,
      vendorName: vendor.businessName,
      amount: amount,
      vendorAmount: vendorAmount,
      platformFee: platformFee,
      currency: currency,
      status: 'completed',
      timestamp: new Date().toISOString(),
      type: 'vendor-qr'
    });
    
    res.json({
      success: true,
      transaction: {
        id: transactionId,
        amount: amount,
        currency: currency,
        status: 'completed',
        vendorName: vendor.businessName
      }
    });
  } catch (error) {
    console.error('Vendor payment error:', error);
    res.status(500).json({ error: error.message || 'Payment failed' });
  }
});

// Generate QR Code for Payment (Protected - requires vendor auth)
app.post('/api/payment/generate', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'usd', description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const vendor = vendors.get(req.vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Create payment intent
    const paymentId = uuidv4();
    const paymentData = {
      id: paymentId,
      vendorId: req.vendorId,
      vendorName: vendor.businessName,
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

    // Calculate 1% platform fee
    const platformFee = payment.amount * 0.01;
    const vendorAmount = payment.amount - platformFee;

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
      vendorId: payment.vendorId,
      vendorName: payment.vendorName,
      amount: payment.amount,
      vendorAmount: vendorAmount,
      platformFee: platformFee,
      currency: payment.currency,
      status: 'completed',
      timestamp: new Date().toISOString(),
      type: 'specific-qr'
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

// Get All Transactions (Protected - filtered by vendor)
app.get('/api/transactions', authMiddleware, (req, res) => {
  try {
    const vendorTransactions = transactions.filter(t => t.vendorId === req.vendorId);
    
    res.json({
      success: true,
      transactions: vendorTransactions.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get Platform Revenue Stats (for admin/monitoring)
app.get('/api/platform/revenue', (req, res) => {
  try {
    const totalPlatformFees = transactions.reduce((sum, t) => sum + (t.platformFee || 0), 0);
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalVendorRevenue = transactions.reduce((sum, t) => sum + (t.vendorAmount || 0), 0);
    
    res.json({
      success: true,
      stats: {
        totalTransactions: transactions.length,
        totalRevenue: totalRevenue,
        totalVendorRevenue: totalVendorRevenue,
        totalPlatformFees: totalPlatformFees,
        platformFeePercentage: 1
      }
    });
  } catch (error) {
    console.error('Error fetching platform revenue:', error);
    res.status(500).json({ error: 'Failed to fetch platform revenue' });
  }
});

// ========== CUSTOMER & PAYMENT METHOD MANAGEMENT ==========

// Create or get customer profile
app.post('/api/customer/profile', async (req, res) => {
  try {
    const { phone, email, name } = req.body;
    
    if (!phone && !email) {
      return res.status(400).json({ error: 'Phone or email required' });
    }
    
    // Check if customer exists
    let customer = null;
    for (const c of customers.values()) {
      if ((phone && c.phone === phone) || (email && c.email === email)) {
        customer = c;
        break;
      }
    }
    
    if (customer) {
      // Return existing customer
      const savedMethods = customerPaymentMethods.get(customer.id) || [];
      return res.json({
        success: true,
        customer: {
          id: customer.id,
          phone: customer.phone,
          email: customer.email,
          name: customer.name,
          stripeCustomerId: customer.stripeCustomerId
        },
        savedPaymentMethods: savedMethods
      });
    }
    
    // Create new Stripe customer
    const stripeCustomer = await stripeClient.customers.create({
      email: email,
      phone: phone,
      name: name,
      metadata: {
        source: 'qr_payment_app'
      }
    });
    
    // Create new customer profile
    const customerId = uuidv4();
    const newCustomer = {
      id: customerId,
      phone: phone,
      email: email,
      name: name,
      stripeCustomerId: stripeCustomer.id,
      createdAt: new Date().toISOString()
    };
    
    customers.set(customerId, newCustomer);
    customerPaymentMethods.set(customerId, []);
    
    res.json({
      success: true,
      customer: {
        id: customerId,
        phone: phone,
        email: email,
        name: name,
        stripeCustomerId: stripeCustomer.id
      },
      savedPaymentMethods: []
    });
  } catch (error) {
    console.error('Error creating customer profile:', error);
    res.status(500).json({ error: 'Failed to create customer profile' });
  }
});

// Get customer profile and payment methods
app.get('/api/customer/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params; // Can be phone, email, or customerId
    
    let customer = null;
    for (const c of customers.values()) {
      if (c.id === identifier || c.phone === identifier || c.email === identifier) {
        customer = c;
        break;
      }
    }
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Get saved payment methods
    const savedMethods = customerPaymentMethods.get(customer.id) || [];
    
    // Fetch latest from Stripe
    try {
      const stripePaymentMethods = await stripeClient.paymentMethods.list({
        customer: customer.stripeCustomerId,
        type: 'card'
      });
      
      res.json({
        success: true,
        customer: {
          id: customer.id,
          phone: customer.phone,
          email: customer.email,
          name: customer.name,
          stripeCustomerId: customer.stripeCustomerId
        },
        savedPaymentMethods: stripePaymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
          isDefault: savedMethods.find(m => m.id === pm.id)?.isDefault || false
        }))
      });
    } catch (stripeError) {
      // Fallback to local storage
      res.json({
        success: true,
        customer: {
          id: customer.id,
          phone: customer.phone,
          email: customer.email,
          name: customer.name,
          stripeCustomerId: customer.stripeCustomerId
        },
        savedPaymentMethods: savedMethods
      });
    }
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Save payment method to customer
app.post('/api/customer/:customerId/payment-method', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { paymentMethodId, setAsDefault } = req.body;
    
    const customer = customers.get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Attach payment method to Stripe customer
    await stripeClient.paymentMethods.attach(paymentMethodId, {
      customer: customer.stripeCustomerId
    });
    
    // Set as default if requested
    if (setAsDefault) {
      await stripeClient.customers.update(customer.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    }
    
    // Get payment method details
    const paymentMethod = await stripeClient.paymentMethods.retrieve(paymentMethodId);
    
    // Save to local storage
    let savedMethods = customerPaymentMethods.get(customerId) || [];
    
    // Update default status
    if (setAsDefault) {
      savedMethods = savedMethods.map(m => ({ ...m, isDefault: false }));
    }
    
    // Add new method
    savedMethods.push({
      id: paymentMethodId,
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      isDefault: setAsDefault || false,
      addedAt: new Date().toISOString()
    });
    
    customerPaymentMethods.set(customerId, savedMethods);
    
    res.json({
      success: true,
      message: 'Payment method saved successfully',
      paymentMethod: {
        id: paymentMethodId,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
        isDefault: setAsDefault || false
      }
    });
  } catch (error) {
    console.error('Error saving payment method:', error);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

// Delete payment method
app.delete('/api/customer/:customerId/payment-method/:paymentMethodId', async (req, res) => {
  try {
    const { customerId, paymentMethodId } = req.params;
    
    const customer = customers.get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Detach from Stripe
    await stripeClient.paymentMethods.detach(paymentMethodId);
    
    // Remove from local storage
    let savedMethods = customerPaymentMethods.get(customerId) || [];
    savedMethods = savedMethods.filter(m => m.id !== paymentMethodId);
    customerPaymentMethods.set(customerId, savedMethods);
    
    res.json({
      success: true,
      message: 'Payment method deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

// Process vendor payment with saved payment method
app.post('/api/vendor/:vendorId/payment-with-saved-method', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { amount, currency = 'usd', description, customerId, paymentMethodId } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    if (!customerId || !paymentMethodId) {
      return res.status(400).json({ error: 'Customer ID and payment method required' });
    }
    
    const vendor = vendors.get(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    const customer = customers.get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Calculate 1% platform fee
    const platformFee = amount * 0.01;
    const vendorAmount = amount - platformFee;
    
    // Create Stripe Payment Intent with saved payment method
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      customer: customer.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: description || `Payment to ${vendor.businessName}`,
    });
    
    // Store transaction
    const transactionId = uuidv4();
    transactions.push({
      id: transactionId,
      paymentId: transactionId,
      vendorId: vendorId,
      customerId: customerId,
      vendorName: vendor.businessName,
      customerName: customer.name,
      amount: amount,
      vendorAmount: vendorAmount,
      platformFee: platformFee,
      currency: currency,
      paymentMethodLast4: paymentMethodId.slice(-4),
      status: 'completed',
      timestamp: new Date().toISOString(),
      stripePaymentIntentId: paymentIntent.id
    });
    
    res.json({
      success: true,
      message: 'Payment processed successfully',
      transaction: {
        id: transactionId,
        amount: amount,
        vendorAmount: vendorAmount,
        platformFee: platformFee,
        currency: currency,
        status: 'completed',
        vendorName: vendor.businessName
      }
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ 
      error: 'Payment failed', 
      message: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 QR Payment Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL}`);
});
