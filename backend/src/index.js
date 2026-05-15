import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});

// Test DB connection
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected at:', result.rows[0]);
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Trading App Backend is running',
    timestamp: new Date()
  });
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Create user (in real app, hash password)
    const result = await pool.query(
      'INSERT INTO users (email, username, password_hash, balance) VALUES ($1, $2, $3, $4) RETURNING id, email, username, balance',
      [email, username, password, 10000]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    
    // Generate simple token (in real app, use JWT)
    const token = Buffer.from(`${user.id}:${email}`).toString('base64');

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        balance: user.balance
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Market Prices
app.get('/api/market/prices', async (req, res) => {
  try {
    const prices = [
      { symbol: 'BTC', name: 'Bitcoin', price: 45000, change: 2.5 },
      { symbol: 'ETH', name: 'Ethereum', price: 2500, change: 1.8 },
      { symbol: 'BNB', name: 'Binance Coin', price: 320, change: 0.5 },
      { symbol: 'XRP', name: 'Ripple', price: 0.52, change: -1.2 },
      { symbol: 'ADA', name: 'Cardano', price: 0.98, change: 3.2 }
    ];
    res.json({ prices });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// Trading - Buy
app.post('/api/trading/buy', async (req, res) => {
  try {
    const { symbol, amount, price, userId } = req.body;
    
    if (!symbol || !amount || !price || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const totalCost = parseFloat(amount) * parseFloat(price);

    // Get user balance
    const user = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.rows[0].balance < totalCost) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Update balance
    await pool.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [totalCost, userId]
    );

    // Add to portfolio
    const existingHolding = await pool.query(
      'SELECT * FROM portfolio WHERE user_id = $1 AND crypto_symbol = $2',
      [userId, symbol]
    );

    if (existingHolding.rows.length > 0) {
      await pool.query(
        'UPDATE portfolio SET amount = amount + $1 WHERE user_id = $2 AND crypto_symbol = $3',
        [amount, userId, symbol]
      );
    } else {
      await pool.query(
        'INSERT INTO portfolio (user_id, crypto_symbol, amount, purchase_price) VALUES ($1, $2, $3, $4)',
        [userId, symbol, amount, price]
      );
    }

    // Record trade
    await pool.query(
      'INSERT INTO trades (user_id, crypto_symbol, amount, price, type) VALUES ($1, $2, $3, $4, $5)',
      [userId, symbol, amount, price, 'buy']
    );

    res.json({
      message: 'Buy order placed successfully',
      order: { symbol, amount, price, totalCost }
    });
  } catch (err) {
    console.error('Buy error:', err);
    res.status(500).json({ error: 'Buy order failed' });
  }
});

// Trading - Sell
app.post('/api/trading/sell', async (req, res) => {
  try {
    const { symbol, amount, price, userId } = req.body;
    
    if (!symbol || !amount || !price || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const totalProceeds = parseFloat(amount) * parseFloat(price);

    // Check portfolio
    const holding = await pool.query(
      'SELECT * FROM portfolio WHERE user_id = $1 AND crypto_symbol = $2',
      [userId, symbol]
    );

    if (holding.rows.length === 0 || holding.rows[0].amount < amount) {
      return res.status(400).json({ error: 'Insufficient holdings' });
    }

    // Update balance
    await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [totalProceeds, userId]
    );

    // Update portfolio
    const newAmount = holding.rows[0].amount - amount;
    if (newAmount === 0) {
      await pool.query(
        'DELETE FROM portfolio WHERE user_id = $1 AND crypto_symbol = $2',
        [userId, symbol]
      );
    } else {
      await pool.query(
        'UPDATE portfolio SET amount = $1 WHERE user_id = $2 AND crypto_symbol = $3',
        [newAmount, userId, symbol]
      );
    }

    // Record trade
    await pool.query(
      'INSERT INTO trades (user_id, crypto_symbol, amount, price, type) VALUES ($1, $2, $3, $4, $5)',
      [userId, symbol, amount, price, 'sell']
    );

    res.json({
      message: 'Sell order placed successfully',
      order: { symbol, amount, price, totalProceeds }
    });
  } catch (err) {
    console.error('Sell error:', err);
    res.status(500).json({ error: 'Sell order failed' });
  }
});

// Portfolio
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await pool.query(
      'SELECT balance FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const portfolioResult = await pool.query(
      'SELECT * FROM portfolio WHERE user_id = $1',
      [userId]
    );

    res.json({
      balance: userResult.rows[0].balance,
      portfolio: portfolioResult.rows
    });
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// Trading History
app.get('/api/trades/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT * FROM trades WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );

    res.json({ trades: result.rows });
  } catch (err) {
    console.error('Trades error:', err);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`\n🚀 Trading App Backend running on http://localhost:${port}`);
  console.log(`📊 API Health: http://localhost:${port}/api/health\n`);
});
