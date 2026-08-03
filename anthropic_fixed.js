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
  // Prefer multiple-choice questions so students can select options and AI can grade reliably
  const prompt = `Create a short multiple-choice STEM quiz for teachers. Subject: ${subject}. Topic: ${topic}. Return strictly a JSON object with: title (string), description (string), questions (array). Each question must include: text (string), options (array of 3-5 short strings), answer (one of the options exactly), acceptedAnswers (array of acceptable alternative strings). Example question: {"text":"...","options":["A","B","C","D"],"answer":"B","acceptedAnswers":["B","Option B"]}.`;
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
      quiz.questions = extracted.questions.map((q) => {
        const options = Array.isArray(q.options) && q.options.length > 0 ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'];
        // Ensure the provided answer matches one of the options; if not, pick the first option as answer
        const answer = options.includes(q.answer) ? q.answer : options[0];
        const acceptedAnswers = Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0 ? q.acceptedAnswers : [answer];
        return {
          question: q.text || q.question || '',
          options,
          answer,
          acceptedAnswers,
        };
      });
    }
  } catch (error) {
    // Fallback: produce a single MCQ
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
  const prompt = `You are grading answers for a STEM quiz. Evaluate each response against the correct answer and accepted alternatives. Return JSON: {"score": number, "total": number, "feedback": string, "perQuestion": [{"questionId": number, "correct": boolean, "feedback": string}]}. Questions: ${JSON.stringify(questions.map((question) => ({
    id: question.id,
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
  const perQuestion = questions.map((question) => {
    const correct = isAcceptedAnswer(submittedAnswers[question.id], question);
    return { questionId: question.id, correct, feedback: correct ? 'Correct' : 'Incorrect - review this topic.' };
  });
  const score = perQuestion.reduce((acc, p) => acc + (p.correct ? 1 : 0), 0);
  const feedback = score === total
    ? 'Excellent work. You answered every question correctly.'
    : `You scored ${score} out of ${total}. Review the questions you missed and revisit the learning material.`;

  return { score, total, feedback, perQuestion };
};

module.exports = {
  generateAIQuiz,
  generateStudyTips,
  evaluateQuizAnswers,
};