const express = require('express');
const router = express.Router();
const db = require('./db');
const auth = require('./auth');
const validators = require('./validators');
const anthropic = require('./anthropic_fixed');

const teacherOnly = [auth.authenticateToken, auth.authorizeRole('teacher')];
const studentOnly = [auth.authenticateToken, auth.authorizeRole('student')];

const parseAcceptedAnswers = (value) => {
  if (Array.isArray(value)) {
    return value.filter((answer) => typeof answer === 'string' && answer.trim().length > 0).map((answer) => answer.trim());
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((answer) => answer.trim())
      .filter((answer) => answer.length > 0);
  }
  return [];
};

const ensureStudentAccess = async (quizId, studentId) => {
  const assignment = await db.get(
    'SELECT id FROM quiz_assignments WHERE quizId = ? AND (assignedToAll = 1 OR studentId = ?)',
    [quizId, studentId]
  );
  return Boolean(assignment);
};

const completeMissionsForTopic = async (studentId, topic) => {
  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return;
  }
  const missions = await db.all('SELECT id FROM missions WHERE topic = ?', [topic.trim()]);
  await Promise.all(missions.map((mission) => db.completeMission(studentId, mission.id)));
};

router.post('/', teacherOnly, async (req, res) => {
  const { title, description, topic, type, timeLimitMinutes, questions, targetStudentIds, assignToAll } = req.body;
  if (!validators.validateTitle(title) || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Quiz title and at least one question are required' });
  }

  const sanitizedQuestions = questions.map((question) => ({
    question: typeof question.question === 'string' ? question.question.trim() : '',
    answer: typeof question.answer === 'string' ? question.answer.trim() : '',
    options: Array.isArray(question.options) ? question.options : [],
    acceptedAnswers: parseAcceptedAnswers(question.acceptedAnswers || question.acceptableAnswers),
  }));

  if (sanitizedQuestions.some((question) => !question.question || !question.answer)) {
    return res.status(400).json({ error: 'Each question must include text and an answer' });
  }

  try {
    const parsedTimeLimit = Number(timeLimitMinutes);
    const quiz = await db.run(
      'INSERT INTO quizzes (title, description, createdBy, topic, type, timeLimitMinutes) VALUES (?, ?, ?, ?, ?, ?)',
      [title.trim(), description || '', req.user.id, typeof topic === 'string' ? topic.trim() : '', typeof type === 'string' ? type.trim() : '', Number.isFinite(parsedTimeLimit) && parsedTimeLimit > 0 ? parsedTimeLimit : 0]
    );
    const quizId = quiz.lastID;
    const questionPromises = sanitizedQuestions.map((question) => {
      const options = JSON.stringify(question.options);
      const acceptedAnswers = JSON.stringify(question.acceptedAnswers);
      return db.run('INSERT INTO questions (quizId, question, options, answer, acceptedAnswers) VALUES (?, ?, ?, ?, ?)', [quizId, question.question, options, question.answer, acceptedAnswers]);
    });
    await Promise.all(questionPromises);

    const assignmentRows = [];
    if (assignToAll) {
      assignmentRows.push(db.run('INSERT INTO quiz_assignments (quizId, assignedToAll) VALUES (?, ?)', [quizId, 1]));
    }
    if (Array.isArray(targetStudentIds)) {
      const ids = [...new Set(targetStudentIds.filter((value) => validators.parsePositiveInt(value)))];
      for (const studentId of ids) {
       assignmentRows.push(db.run('INSERT INTO quiz_assignments (quizId, studentId) VALUES (?, ?)', [quizId, studentId]));
      }
    }
    if (assignmentRows.length > 0) {
      await Promise.all(assignmentRows);
    }

    res.json({ message: 'Quiz created successfully', quizId, assignedToAll: Boolean(assignToAll), studentIds: Array.isArray(targetStudentIds) ? targetStudentIds.filter((value) => validators.parsePositiveInt(value)) : [] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to create quiz' });
  }
});

router.get('/', auth.authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const quizzes = await db.all(
       `SELECT q.id, q.title, q.description, q.topic, q.type, q.timeLimitMinutes, q.createdBy, q.createdAt, COUNT(qa.id) AS assignedCount
        FROM quizzes q
        LEFT JOIN quiz_assignments qa ON qa.quizId = q.id
        GROUP BY q.id
        ORDER BY q.createdAt DESC`
      );
      res.json(quizzes);
      return;
    }

    const quizzes = await db.all(
      `SELECT q.id, q.title, q.description, q.topic, q.type, q.timeLimitMinutes, q.createdBy, q.createdAt
       FROM quizzes q
       JOIN quiz_assignments qa ON qa.quizId = q.id
       WHERE qa.assignedToAll = 1 OR qa.studentId = ?
       GROUP BY q.id
       ORDER BY q.createdAt DESC`,
      [req.user.id]
    );
    res.json(quizzes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to list quizzes' });
  }
});

router.get('/:id/questions', auth.authenticateToken, async (req, res) => {
  const quizId = validators.parsePositiveInt(req.params.id);
  if (!quizId) {
    return res.status(400).json({ error: 'Invalid quiz ID' });
  }

  try {
    const quiz = await db.get('SELECT id, createdBy, timeLimitMinutes FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    if (req.user.role !== 'teacher') {
      const hasAccess = await ensureStudentAccess(quizId, req.user.id);
      if (!hasAccess) {
       return res.status(403).json({ error: 'Quiz not assigned to you' });
      }
    }

    const questions = await db.all('SELECT id, question, options, answer, acceptedAnswers FROM questions WHERE quizId = ?', [quizId]);
    const parsed = questions.map((item) => ({
      ...item,
      options: JSON.parse(item.options),
      acceptedAnswers: JSON.parse(item.acceptedAnswers || '[]'),
    }));
    res.json({ quiz, questions: parsed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load quiz questions' });
  }
});

router.post('/:id/submit', studentOnly, async (req, res) => {
  const quizId = validators.parsePositiveInt(req.params.id);
  if (!quizId) {
    return res.status(400).json({ error: 'Invalid quiz ID' });
  }

  const answers = typeof req.body.answers === 'object' && req.body.answers !== null ? req.body.answers : {};
  const startedAt = Number(req.body.startedAt || 0);

  try {
    const quiz = await db.get('SELECT id, title, timeLimitMinutes FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const hasAccess = await ensureStudentAccess(quizId, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Quiz not assigned to you' });
    }

    const questions = await db.all('SELECT id, question, answer, acceptedAnswers FROM questions WHERE quizId = ?', [quizId]);
    const evaluation = await anthropic.evaluateQuizAnswers(questions, answers);
    const expired = quiz.timeLimitMinutes > 0 && startedAt > 0 && Date.now() - startedAt > quiz.timeLimitMinutes * 60 * 1000;
    const existing = await db.get('SELECT id FROM quiz_results WHERE quizId = ? AND studentId = ?', [quizId, req.user.id]);
    let resultId;

    if (existing) {
      await db.run(
        'UPDATE quiz_results SET score = ?, feedback = ?, totalQuestions = ?, takenAt = CURRENT_TIMESTAMP WHERE id = ?',
        [evaluation.score, evaluation.feedback, evaluation.total, existing.id]
      );
      resultId = existing.id;
    } else {
      const insertRes = await db.run('INSERT INTO quiz_results (quizId, studentId, score, feedback, totalQuestions) VALUES (?, ?, ?, ?, ?)', [quizId, req.user.id, evaluation.score, evaluation.feedback, evaluation.total]);
      resultId = insertRes.lastID;
    }

    await completeMissionsForTopic(req.user.id, quiz.topic);

    res.json({ message: 'Quiz submitted', score: evaluation.score, total: evaluation.total, feedback: evaluation.feedback, expired });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to submit quiz' });
  }
});

router.get('/me/results', studentOnly, async (req, res) => {
  try {
    const results = await db.all(
     `SELECT qr.id, qr.score, qr.totalQuestions, qr.takenAt, qr.feedback, q.title AS quizTitle, q.topic, q.type, q.timeLimitMinutes
       FROM quiz_results qr
       JOIN quizzes q ON qr.quizId = q.id
       WHERE qr.studentId = ?
       ORDER BY qr.takenAt DESC`,
      [req.user.id]
    );
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load your quiz results' });
  }
});

router.get('/me/missions', studentOnly, async (req, res) => {
  try {
    const missions = await db.getStudentMissionStatuses(req.user.id);
    const completedCount = missions.filter((mission) => mission.completed === 1).length;
    const nextMission = missions.find((mission) => mission.completed === 0) || null;
    res.json({ missions, completedCount, totalMissions: missions.length, nextMission });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load mission progress' });
  }
});

router.get('/me/recommendations', studentOnly, async (req, res) => {
  try {
    const missions = await db.getStudentMissionStatuses(req.user.id);
    const recommended = missions.filter((mission) => mission.completed === 0).slice(0, 3);
    res.json({ recommended });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load recommendations' });
  }
});

router.get('/:id/results', teacherOnly, async (req, res) => {
  const quizId = validators.parsePositiveInt(req.params.id);
  if (!quizId) {
    return res.status(400).json({ error: 'Invalid quiz ID' });
  }

  try {
    const results = await db.all(
      `SELECT qr.id, qr.score, qr.totalQuestions, qr.takenAt, qr.feedback, u.id AS studentId, u.name AS studentName
       FROM quiz_results qr
       JOIN users u ON qr.studentId = u.id
       WHERE qr.quizId = ?
       ORDER BY qr.takenAt DESC`,
      [quizId]
    );
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load quiz results' });
  }
});

module.exports = router;
