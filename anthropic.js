const axios = require('axios');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/complete';

const defaultAnswer = async (prompt) => ({
  output: `AI stub response for prompt: ${prompt}`,
});

const callAnthropic = async (prompt) => {
  if (!ANTHROPIC_API_KEY) {
    return defaultAnswer(prompt);
  }

  const response = await axios.post(
    ANTHROPIC_URL,
    {
      model: 'claude-2.1',
      prompt,
      max_tokens_to_sample: 500,
      temperature: 0.7,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANTHROPIC_API_KEY}`,
      },
    }
  );

  return response.data;
};

const normalizeText = (value) =>
  `${value || ''}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');

const isAcceptedAnswer = (submittedAnswer, question) => {
  const primaryAnswers = [question.answer, ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [])];
  const normalizedInput = normalizeText(submittedAnswer);
  return primaryAnswers.some((answer) => normalizeText(answer) === normalizedInput);
};

const generateAIQuiz = async (topic, subject) => {
  const prompt = `Create a short STEM quiz for teachers. Subject: ${subject}. Topic: ${topic}. Provide a JSON object with a title, description, and an array of questions. Each question should have text, options, the correct answer, and a short array of accepted alternatives.`;
  const response = await callAnthropic(prompt);
  const output = response.output || response.completion || response.choices?.[0]?.text || '';
  let quiz = {
    title: `${subject} quiz on ${topic}`,
    description: `Generated AI quiz for ${subject} - ${topic}`,
    questions: [],
  };

  try {
    const extracted = JSON.parse(output.trim());
    if (extracted.title) quiz.title = extracted.title;
    if (extracted.description) quiz.description = extracted.description;
    if (Array.isArray(extracted.questions)) {
      quiz.questions = extracted.questions.map((question) => ({
        ...question,
        acceptedAnswers: Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [question.answer],
      }));
    }
  } catch (error) {
    quiz.questions = [
      {
        question: `What is one important concept in ${subject} for the topic ${topic}?`,
        options: ['Concept A', 'Concept B', 'Concept C', 'Concept D'],
        answer: 'Concept A',
        acceptedAnswers: ['Concept A', 'A'],
      },
    ];
  }

  return quiz;
};

const generateStudyTips = async (name, performanceSummary) => {
  const prompt = `Generate three personalized study tips for a student named ${name}. Use the following summary: ${performanceSummary}`;
  const response = await callAnthropic(prompt);
  const output = response.output || response.completion || response.choices?.[0]?.text || '';
  return output.trim();
};

const evaluateQuizAnswers = async (questions, submittedAnswers) => {
  const prompt = `You are grading answers for a STEM quiz. Evaluate each response against the correct answer and accepted alternatives. Return JSON: {"score": number, "total": number, "feedback": string}. Questions: ${JSON.stringify(questions.map((question) => ({
    question: question.question,
    answer: question.answer,
    acceptedAnswers: question.acceptedAnswers || [],
    submittedAnswer: submittedAnswers[question.id],
  })))}.`;

  const response = await callAnthropic(prompt);
  const output = response.output || response.completion || response.choices?.[0]?.text || '';

  try {
    const parsed = JSON.parse(output.trim());
    if (Number.isInteger(parsed.score) && Number.isInteger(parsed.total)) {
      return parsed;
    }
  } catch (error) {
    // fall through to heuristic fallback
  }

  const total = questions.length;
  const score = questions.reduce((acc, question) => acc + (isAcceptedAnswer(submittedAnswers[question.id], question) ? 1 : 0), 0);
  const feedback = score === total
    ? 'Excellent work. You answered every question correctly.'
    : `You scored ${score} out of ${total}. Review the questions you missed and revisit the learning material.`;

  return { score, total, feedback };
};

module.exports = {
  generateAIQuiz,
  generateStudyTips,
  evaluateQuizAnswers,
};
