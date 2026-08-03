const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'default_jwt_secret';

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || req.body.token || req.query.token;
  return authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
};

const verifyToken = (token) => jwt.verify(token, secret);

const generateToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    },
    secret,
    { expiresIn: '8h' }
  );

const authenticateToken = (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const authorizeRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden: insufficient privileges' });
  }
  next();
};

module.exports = {
  generateToken,
  authenticateToken,
  authorizeRole,
  getTokenFromRequest,
  verifyToken,
};
