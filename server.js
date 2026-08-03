const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const validators = require('./validators');
const teacherRoutes = require('./teacher');
const resourceRoutes = require('./resource');
const quizzesRoutes = require('./quizzes');
const aiRoutes = require('./ai');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 45;
const RESET_TOKEN_EXPIRY_MINUTES = Number(process.env.RESET_TOKEN_EXPIRY_MINUTES) || 15;

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  keyGenerator: (req) => {
    const token = auth.getTokenFromRequest(req);
    if (token) {
      try {
        const payload = auth.verifyToken(token);
        if (payload && payload.id) {
          return `user-${payload.id}`;
        }
      } catch (error) {
        // Fall back to IP if token is invalid or expired
      }
    }
    return ipKeyGenerator(req.ip);
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!validators.validateUsername(username) || !validators.validatePassword(password)) {
    return res.status(400).json({ error: 'A valid username and password are required' });
  }

  try {
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await db.verifyPassword(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = auth.generateToken({ id: user.id, username: user.username, role: user.role, name: user.name });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/request-password-reset', async (req, res) => {
  const { username } = req.body;
  if (!validators.validateUsername(username)) {
    return res.status(400).json({ error: 'A valid username is required' });
  }

  try {
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.json({ message: 'If that account exists, a password reset request has been created.' });
    }

    await db.invalidatePasswordResetTokensForUser(user.id);
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
    await db.createPasswordResetToken(user.id, resetToken, expiresAt);

    res.json({
      message: `Password reset link created and expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.`,
      resetToken,
      expiresAt,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to create password reset request' });
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!validators.validateResetToken(token) || !validators.validatePassword(newPassword)) {
    return res.status(400).json({ error: 'A valid reset token and a new password are required' });
  }

  try {
    const resetRecord = await db.getValidPasswordResetToken(token);
    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const hashedPassword = await db.hashPassword(newPassword);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, resetRecord.userId]);
    await db.invalidatePasswordResetTokensForUser(resetRecord.userId);
    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to reset password' });
  }
});

app.get('/profile', auth.authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.use('/teachers', auth.authenticateToken, teacherRoutes);
app.use('/resources', resourceRoutes);
app.use('/quizzes', quizzesRoutes);
app.use('/ai', auth.authenticateToken, aiRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path === '/' ? 'index.html' : req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

db.initialize()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize database', error);
    process.exit(1);
  });
