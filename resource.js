const express = require('express');
const router = express.Router();
const db = require('./db');
const auth = require('./auth');
const validators = require('./validators');

const teacherOnly = [auth.authenticateToken, auth.authorizeRole('teacher')];

router.post('/', teacherOnly, async (req, res) => {
  const { title, url, description } = req.body;
  if (!validators.validateTitle(title) || !validators.validateUrl(url)) {
    return res.status(400).json({ error: 'A valid title and URL are required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO resources (title, url, description, uploadedBy, verified) VALUES (?, ?, ?, ?, 0)',
      [title.trim(), url.trim(), (description || '').trim(), req.user.id]
    );
    res.json({ message: 'Resource uploaded successfully', resourceId: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to upload resource' });
  }
});

router.put('/:id/verify', teacherOnly, async (req, res) => {
  const resourceId = validators.parsePositiveInt(req.params.id);
  if (!resourceId) {
    return res.status(400).json({ error: 'Invalid resource ID' });
  }

  try {
    await db.run('UPDATE resources SET verified = 1 WHERE id = ?', [resourceId]);
    res.json({ message: 'Resource verified successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to verify resource' });
  }
});

router.delete('/:id', teacherOnly, async (req, res) => {
  const resourceId = validators.parsePositiveInt(req.params.id);
  if (!resourceId) {
    return res.status(400).json({ error: 'Invalid resource ID' });
  }

  try {
    await db.run('DELETE FROM resources WHERE id = ?', [resourceId]);
    res.json({ message: 'Resource deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to delete resource' });
  }
});

router.get('/', async (req, res) => {
  const verifiedOnly = req.query.verified === 'true';

  try {
    const sql = verifiedOnly
      ? `SELECT r.id, r.title, r.url, r.description, r.verified, r.createdAt, u.name AS uploadedBy
         FROM resources r
         LEFT JOIN users u ON r.uploadedBy = u.id
         WHERE r.verified = ?
         ORDER BY r.createdAt DESC`
      : `SELECT r.id, r.title, r.url, r.description, r.verified, r.createdAt, u.name AS uploadedBy
         FROM resources r
         LEFT JOIN users u ON r.uploadedBy = u.id
         ORDER BY r.createdAt DESC`;
    const resources = await db.all(sql, verifiedOnly ? [1] : []);
    res.json(resources);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to list resources' });
  }
});

module.exports = router;
