const express = require('express');
const router = express.Router();
const db = require('./db');
const auth = require('./auth');
const validators = require('./validators');
const anthropic = require('./anthropic_fixed');

router.post('/quizzes', auth.authorizeRole('teacher'), async (req, res) => {
  const { subject, topic, type, timeLimitMinutes, assignToAll, targetStudentIds } = req.body;
  if (!validators.validateTitle(subject) || !validators.validateTitle(topic)) {
    return res.status(400).json({ error: 'A valid subject and topic are required' });
  }

  try {
    const quiz = await anthropic.generateAIQuiz(topic, subject);
    const parsedTimeLimit = Number(timeLimitMinutes);
    const inserted = await db.run(
      'INSERT INTO quizzes (title, description, createdBy, topic, type, timeLimitMinutes) VALUES (?, ?, ?, ?, ?, ?)',
      [quiz.title, quiz.description, req.user.id, topic.trim(), typeof type === 'string' ? type.trim() : 'AI Generated', Number.isFinite(parsedTimeLimit) && parsedTimeLimit > 0 ? parsedTimeLimit : 0]
    );
    const quizId = inserted.lastID;
    const questionPromises = quiz.questions.map((question) => {
      const options = JSON.stringify(question.options || []);
      const acceptedAnswers = JSON.stringify(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [question.answer]);
      return db.run('INSERT INTO questions (quizId, question, options, answer, acceptedAnswers) VALUES (?, ?, ?, ?, ?)', [quizId, question.question, options, question.answer, acceptedAnswers]);
    });
    await Promise.all(questionPromises);

    const assignmentRows = [];
    if (assignToAll) {
      assignmentRows.push(db.run('INSERT INTO quiz_assignments (quizId, assignedToAll) VALUES (?, ?)', [quizId, 1]));
    }
    if (Array.isArray(targetStudentIds)) {
      const ids = [...new Set(targetStudentIds.filter((value) => validators.parsePositiveInt(value)))];
      ids.forEach((studentId) => {
        assignmentRows.push(db.run('INSERT INTO quiz_assignments (quizId, studentId) VALUES (?, ?)', [quizId, studentId]));
      });
    }
    if (assignmentRows.length > 0) {
      await Promise.all(assignmentRows);
    }

    res.json({ message: 'AI quiz generated successfully', quizId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to generate AI quiz' });
  }
});

router.post('/study-tips', auth.authorizeRole('student'), async (req, res) => {
  const { summary } = req.body;
  if (!validators.validateSummary(summary)) {
    return res.status(400).json({ error: 'A valid performance summary is required' });
  }

  try {
    const tipText = await anthropic.generateStudyTips(req.user.name, summary);
    await db.run('INSERT INTO ai_tips (studentId, tip) VALUES (?, ?)', [req.user.id, tipText]);
    res.json({ message: 'Personalized tips generated', tip: tipText });
  } catch (error) {
    res.status(500).json({ error: 'Unable to generate study tips' });
  }
});

router.get('/study-tips', auth.authorizeRole('student'), async (req, res) => {
  try {
    const tips = await db.all('SELECT id, tip, createdAt FROM ai_tips WHERE studentId = ? ORDER BY createdAt DESC', [req.user.id]);
    res.json(tips);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load study tips' });
  }
});

module.exports = router;
