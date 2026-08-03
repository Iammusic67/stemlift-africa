const express = require('express');
const router = express.Router();
const db = require('./db');
const auth = require('./auth');
const validators = require('./validators');

router.use(auth.authorizeRole('teacher'));

router.post('/students', async (req, res) => {
  const { username, password, name } = req.body;
  if (!validators.validateUsername(username) || !validators.validatePassword(password) || !validators.validateName(name)) {
    return res.status(400).json({ error: 'A valid username, password, and student name are required' });
  }

  try {
    const hashedPassword = await db.hashPassword(password);
    const user = await db.run(
      'INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
      [username.trim(), hashedPassword, 'student', name.trim()]
    );
    res.json({ message: 'Student added successfully', studentId: user.lastID });
  } catch (error) {
    console.error(error);
    if (error.message.includes('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'A student with that username already exists' });
    }
    res.status(500).json({ error: 'Unable to add student' });
  }
});

router.delete('/students/:id', async (req, res) => {
  const studentId = validators.parsePositiveInt(req.params.id);
  if (!studentId) {
    return res.status(400).json({ error: 'Invalid student ID' });
  }

  try {
    await db.run('DELETE FROM users WHERE id = ? AND role = ?', [studentId, 'student']);
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to remove student' });
  }
});

router.get('/students', async (req, res) => {
  try {
    const students = await db.all('SELECT id, username, name, createdAt FROM users WHERE role = ?', ['student']);
    const results = await Promise.all(
      students.map(async (student) => {
        const performance = await db.get(
         `SELECT COUNT(*) AS quizzesTaken, AVG(score) AS averageScore, MAX(takenAt) AS lastTakenAt
          FROM quiz_results WHERE studentId = ?`,
         [student.id]
       );
       return {
         ...student,
         quizzesTaken: performance.quizzesTaken || 0,
         averageScore: performance.averageScore ? Number(performance.averageScore.toFixed(1)) : 0,
         lastTakenAt: performance.lastTakenAt || null,
       };
      })
    );
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to list students' });
  }
});

router.get('/students/:id/performance', async (req, res) => {
  const studentId = validators.parsePositiveInt(req.params.id);
  if (!studentId) {
    return res.status(400).json({ error: 'Invalid student ID' });
  }

  try {
    const student = await db.get('SELECT id, username, name FROM users WHERE id = ? AND role = ?', [studentId, 'student']);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const performance = await db.get(
      `SELECT COUNT(*) AS quizzesTaken, AVG(score) AS averageScore, MAX(takenAt) AS lastTakenAt
       FROM quiz_results WHERE studentId = ?`,
      [studentId]
    );
    const results = await db.all(
      `SELECT qr.id, qr.score, qr.takenAt, qr.feedback, q.title AS quizTitle, q.topic, q.type
       FROM quiz_results qr
       JOIN quizzes q ON qr.quizId = q.id
       WHERE qr.studentId = ?
       ORDER BY qr.takenAt DESC`,
      [studentId]
    );
    res.json({ student, performance: { quizzesTaken: performance.quizzesTaken || 0, averageScore: performance.averageScore ? Number(performance.averageScore.toFixed(1)) : 0, lastTakenAt: performance.lastTakenAt || null }, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to get student performance' });
  }
});

router.post('/assign-quiz', async (req, res) => {
  const quizId = validators.parsePositiveInt(req.body.quizId);
  if (!quizId) {
    return res.status(400).json({ error: 'A valid quiz ID is required' });
  }

  const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds : [];
  const assignToAll = Boolean(req.body.assignToAll);

  try {
    const quiz = await db.get('SELECT id FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const ops = [];
    if (assignToAll) {
      ops.push(db.run('INSERT INTO quiz_assignments (quizId, assignedToAll) VALUES (?, ?)', [quizId, 1]));
    }

    if (studentIds.length > 0) {
      const ids = [...new Set(studentIds.map((v) => validators.parsePositiveInt(v)).filter(Boolean))];
      for (const sid of ids) {
        ops.push(db.run('INSERT INTO quiz_assignments (quizId, studentId) VALUES (?, ?)', [quizId, sid]));
      }
    }

    if (ops.length > 0) await Promise.all(ops);
    res.json({ message: 'Quiz assigned', quizId, assignedToAll: assignToAll, studentIds: studentIds });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to assign quiz' });
  }
});

router.get('/assignments', async (req, res) => {
  try {
    const assignments = await db.all(
      `SELECT qa.id, qa.quizId, q.title, qa.studentId, u.name AS studentName, qa.assignedToAll, qa.createdAt
       FROM quiz_assignments qa
       LEFT JOIN quizzes q ON qa.quizId = q.id
       LEFT JOIN users u ON qa.studentId = u.id
       ORDER BY qa.createdAt DESC`
    );
    res.json(assignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load assignments' });
  }
});

// Add a route for adding another teacher (only available to existing teachers)
router.post('/add-teacher', async (req, res) => {
  const { username, password, name } = req.body;
  if (!validators.validateUsername(username) || !validators.validatePassword(password) || !validators.validateName(name)) {
    return res.status(400).json({ error: 'A valid username, password, and name are required' });
  }

  try {
    const hashedPassword = await db.hashPassword(password);
    const user = await db.run(
      'INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
      [username.trim(), hashedPassword, 'teacher', name.trim()]
    );
    res.json({ message: 'Teacher added successfully', teacherId: user.lastID });
  } catch (error) {
    console.error(error);
    if (error.message.includes('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'A user with that username already exists' });
    }
    res.status(500).json({ error: 'Unable to add teacher' });
  }
});

// Performance summary with ranks and overall mean score
router.get('/performance/summary', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT u.id AS studentId, u.name, u.username,
        COUNT(qr.id) AS attempts,
        AVG(CASE WHEN qr.totalQuestions > 0 THEN (CAST(qr.score AS REAL)/qr.totalQuestions)*100 ELSE 0 END) AS averagePercent
       FROM users u
       LEFT JOIN quiz_results qr ON qr.studentId = u.id
       WHERE u.role = 'student'
       GROUP BY u.id
       ORDER BY averagePercent DESC NULLS LAST`
    );

    // compute ranks (dense ranking) and overall mean
    const students = rows.map((r) => ({
      studentId: r.studentId,
      name: r.name,
      username: r.username,
      attempts: r.attempts || 0,
      averagePercent: r.averagePercent ? Number(Number(r.averagePercent).toFixed(1)) : 0,
    }));

    let lastScore = null;
    let rank = 0;
    let denseRank = 0;
    students.forEach((s) => {
      denseRank += 1;
      if (lastScore === null || s.averagePercent < lastScore) {
        rank = denseRank;
        lastScore = s.averagePercent;
      }
      s.rank = rank;
    });

    const meanOfMeans = students.length > 0 ? Number((students.reduce((acc, s) => acc + s.averagePercent, 0) / students.length).toFixed(1)) : 0;

    res.json({ students, meanAveragePercent: meanOfMeans });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to compute performance summary' });
  }
});

module.exports = router;
