const apiRequest = async (url, method = 'GET', body) => {
  const token = localStorage.getItem('stemliftToken');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
};

const redirectToRoleDashboard = (role) => {
  if (role === 'teacher') {
    window.location.href = '/teachers-dashboard.html';
  } else if (role === 'student') {
    window.location.href = '/students-dashboard.html';
  }
};

const logout = () => {
  localStorage.removeItem('stemliftToken');
  localStorage.removeItem('stemliftUser');
  window.location.href = '/';
};

const initializeLogin = () => {
  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const result = await apiRequest('/login', 'POST', { username, password });
    if (result.token) {
      localStorage.setItem('stemliftToken', result.token);
      localStorage.setItem('stemliftUser', JSON.stringify(result.user));
      redirectToRoleDashboard(result.user.role);
    } else {
      error.textContent = result.error || 'Unable to sign in.';
    }
  });
};

const ensureAuthenticated = async () => {
  const token = localStorage.getItem('stemliftToken');
  if (!token) {
    window.location.href = '/';
    return null;
  }

  const profile = await apiRequest('/profile');
  if (profile.user) {
    return profile.user;
  }

  window.location.href = '/';
  return null;
};

const buildTable = (headers, rows) => {
  const table = document.createElement('table');
  const headRow = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headRow.appendChild(th);
  });
  table.appendChild(headRow);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    headers.forEach((header) => {
      const td = document.createElement('td');
      td.textContent = row[header] ?? '';
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  return table;
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
};

const createEmptyState = (message) => {
  const container = document.createElement('div');
  container.className = 'empty-state';
  container.textContent = message;
  return container;
};

let teacherStudents = [];

const renderStudentSelector = (container, checkboxName) => {
  container.innerHTML = '';
  if (!Array.isArray(teacherStudents) || teacherStudents.length === 0) {
    container.appendChild(createEmptyState('No students are available yet. Create a student to assign quizzes.'));
    return;
  }

  teacherStudents.forEach((student) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = checkboxName;
    checkbox.value = student.id;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${student.name} (${student.username})`));
    container.appendChild(label);
  });
};

const getSelectedStudentIds = (form, fieldName) => {
  return Array.from(form.querySelectorAll(`input[name="${fieldName}"]:checked`))
    .map((input) => Number(input.value))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const buildQuestionRow = (index, values = {}) => {
  const row = document.createElement('div');
  row.className = 'question-row';
  row.dataset.questionIndex = index;

  const questionLabel = document.createElement('label');
  questionLabel.textContent = 'Question';
  const questionInput = document.createElement('input');
  questionInput.type = 'text';
  questionInput.name = `question-${index}`;
  questionInput.required = true;
  questionInput.value = values.question || '';
  questionLabel.appendChild(questionInput);

  const optionsLabel = document.createElement('label');
  optionsLabel.textContent = 'Options';
  const optionsInput = document.createElement('input');
  optionsInput.type = 'text';
  optionsInput.name = `options-${index}`;
  optionsInput.placeholder = 'Separate options with |';
  optionsInput.required = true;
  optionsInput.value = values.options || '';
  optionsLabel.appendChild(optionsInput);

  const answerLabel = document.createElement('label');
  answerLabel.textContent = 'Answer';
  const answerInput = document.createElement('input');
  answerInput.type = 'text';
  answerInput.name = `answer-${index}`;
  answerInput.required = true;
  answerInput.value = values.answer || '';
  answerLabel.appendChild(answerInput);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'secondary';
  removeButton.textContent = 'Remove question';
  removeButton.addEventListener('click', () => {
    row.remove();
  });

  const actions = document.createElement('div');
  actions.className = 'button-row';
  actions.appendChild(removeButton);

  row.appendChild(questionLabel);
  row.appendChild(optionsLabel);
  row.appendChild(answerLabel);
  row.appendChild(actions);
  return row;
};

const collectQuizQuestions = (form) => {
  const questions = [];
  const rows = Array.from(form.querySelectorAll('.question-row'));
  rows.forEach((row) => {
    const question = row.querySelector('input[name^="question-"]')?.value.trim();
    const options = row.querySelector('input[name^="options-"]')?.value.trim();
    const answer = row.querySelector('input[name^="answer-"]')?.value.trim();
    if (question && options && answer) {
      questions.push({
        question,
        options: options.split('|').map((item) => item.trim()).filter(Boolean),
        answer,
      });
    }
  });
  return questions;
};

const showCards = (cardsToShow, actionGridId, backButtonId, cardClass) => {
  const actionGrid = document.getElementById(actionGridId);
  const backButton = document.getElementById(backButtonId);
  const cards = document.querySelectorAll(`.${cardClass}`);

  cards.forEach((card) => card.classList.add('hidden'));
  cardsToShow.forEach((cardId) => {
    const card = document.getElementById(cardId);
    if (card) card.classList.remove('hidden');
  });

  if (actionGrid) actionGrid.classList.add('hidden');
  if (backButton) backButton.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const showActionMenu = (actionGridId, backButtonId, cardClass) => {
  const actionGrid = document.getElementById(actionGridId);
  const backButton = document.getElementById(backButtonId);
  const cards = document.querySelectorAll(`.${cardClass}`);

  cards.forEach((card) => card.classList.add('hidden'));
  if (actionGrid) actionGrid.classList.remove('hidden');
  if (backButton) backButton.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const formatScoreValue = (row) => {
  const total = Number(row.totalQuestions || row.total || 0);
  if (total > 0) {
    return `${row.score}/${total}`;
  }
  return `${row.score}`;
};

const buildPerformanceSummary = (rows) => {
  const summary = document.createElement('div');
  summary.className = 'performance-summary';

  const total = rows.length;
  const averageScore = total > 0
    ? (rows.reduce((acc, row) => acc + (Number(row.score || 0) / Math.max(Number(row.totalQuestions || row.total || 1), 1)), 0) / total * 100).toFixed(0)
    : '0';
  const latest = rows[0];

  const metrics = [
    { label: 'Quizzes taken', value: total },
    { label: 'Avg. score', value: `${averageScore}%` },
    { label: 'Latest attempt', value: latest ? formatDate(latest.takenAt) : 'No attempts yet' },
  ];

  metrics.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'metric';
    const value = document.createElement('div');
    value.className = 'metric-value';
    value.textContent = metric.value;
    const label = document.createElement('div');
    label.className = 'metric-label';
    label.textContent = metric.label;
    card.appendChild(value);
    card.appendChild(label);
    summary.appendChild(card);
  });

  return summary;
};

const renderResources = (container, resources, { showActions = false } = {}) => {
  container.innerHTML = '';
  if (!Array.isArray(resources) || resources.length === 0) {
    container.appendChild(createEmptyState('No resources available yet.'));
    return;
  }

  resources.forEach((resource) => {
    const card = document.createElement('article');
    card.className = 'quiz-card';
    card.innerHTML = `
      <strong>${resource.title}</strong>
      <p><a href="${resource.url}" target="_blank" rel="noopener noreferrer">${resource.url}</a></p>
      <p>${resource.description || 'No description provided.'}</p>
      <small>Status: ${resource.verified ? 'Verified' : 'Pending verification'} • Uploaded by: ${resource.uploadedBy || 'Unknown'}</small>
    `;

    if (showActions) {
      const actions = document.createElement('div');
      actions.className = 'button-row';
      if (!resource.verified) {
        const verifyButton = document.createElement('button');
        verifyButton.textContent = 'Verify';
        verifyButton.addEventListener('click', () => verifyResource(resource.id));
        actions.appendChild(verifyButton);
      }
      const deleteButton = document.createElement('button');
      deleteButton.className = 'secondary';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => deleteResource(resource.id));
      actions.appendChild(deleteButton);
      card.appendChild(actions);
    }

    container.appendChild(card);
  });
};

const verifyResource = async (resourceId) => {
  await apiRequest(`/resources/${resourceId}/verify`, 'PUT');
  loadResources();
};

const deleteResource = async (resourceId) => {
  await apiRequest(`/resources/${resourceId}`, 'DELETE');
  loadResources();
};

let activeQuizTimer = null;
let currentQuizStartAt = null;

const stopActiveQuizTimer = () => {
  if (activeQuizTimer) {
    window.clearInterval(activeQuizTimer);
    activeQuizTimer = null;
  }
  currentQuizStartAt = null;
};

const submitQuiz = async (quizId, answers, startedAt, runner) => {
  const result = await apiRequest(`/quizzes/${quizId}/submit`, 'POST', { answers, startedAt });
  stopActiveQuizTimer();
  runner.innerHTML = '';
  const message = document.createElement('div');
  message.className = 'message';
  message.innerHTML = `<strong>Score:</strong> ${result.score}/${result.total}<br />${result.feedback}`;
  runner.appendChild(message);
  loadPerformance();
};

const openQuizRunner = async (quiz) => {
  const runner = document.getElementById('quiz-runner');
  runner.innerHTML = '<div class="message">Loading quiz…</div>';
  stopActiveQuizTimer();
  currentQuizStartAt = Date.now();

  try {
    const response = await apiRequest(`/quizzes/${quiz.id}/questions`);
    const questions = response.questions || [];
    if (!Array.isArray(questions) || questions.length === 0) {
      runner.innerHTML = '<div class="message">No questions available for this quiz yet.</div>';
      return;
    }

    const container = document.createElement('div');
    container.className = 'modal';
    // Build a scaffold for the quiz runner; populate question inputs based on whether options exist
    container.innerHTML = `
      <div class="modal-card">
        <h2>${quiz.title}</h2>
        <p>${quiz.description || ''}</p>
        <div id="quiz-timer" class="message"></div>
        <form id="quiz-form">
          <div id="quiz-questions-wrapper"></div>
          <div class="button-row">
            <button type="submit">Submit quiz</button>
            <button type="button" class="secondary" id="close-quiz">Close</button>
          </div>
        </form>
      </div>
    `;

    // Populate questions: use radio buttons when options are provided, otherwise a text input
    const questionsWrapper = container.querySelector('#quiz-questions-wrapper');
    questions.forEach((question, index) => {
      const qDiv = document.createElement('div');
      qDiv.className = 'quiz-question';
      const qLabel = document.createElement('label');
      qLabel.textContent = `${index + 1}. ${question.question}`;
      qDiv.appendChild(qLabel);

      if (Array.isArray(question.options) && question.options.length > 0) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'options-row';
        question.options.forEach((opt, optIndex) => {
          const optionId = `q-${question.id}-opt-${optIndex}`;
          const optLabel = document.createElement('label');
          optLabel.htmlFor = optionId;
          optLabel.className = 'option-item';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = String(question.id);
          radio.value = opt;
          radio.id = optionId;
          optLabel.appendChild(radio);
          const span = document.createElement('span');
          span.textContent = ` ${opt}`;
          optLabel.appendChild(span);
          optionsContainer.appendChild(optLabel);
        });
        qDiv.appendChild(optionsContainer);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = String(question.id);
        input.placeholder = 'Type your answer';
        qDiv.appendChild(input);
      }

      questionsWrapper.appendChild(qDiv);
    });

    const form = container.querySelector('form');
    const timerEl = container.querySelector('#quiz-timer');
    const closeButton = container.querySelector('#close-quiz');

    const updateTimer = () => {
      if (!currentQuizStartAt || !quiz.timeLimitMinutes) {
        timerEl.textContent = 'Time limit: no limit';
        return;
      }
      const elapsed = Date.now() - currentQuizStartAt;
      const remainingMs = quiz.timeLimitMinutes * 60 * 1000 - elapsed;
      if (remainingMs <= 0) {
        timerEl.textContent = 'Time is up. Submitting your quiz now.';
        form.requestSubmit();
        return;
      }
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      timerEl.textContent = `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (quiz.timeLimitMinutes > 0) {
      updateTimer();
      activeQuizTimer = window.setInterval(updateTimer, 1000);
    } else {
      timerEl.textContent = 'Time limit: no limit';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submittedAnswers = {};
      const formData = new FormData(form);
      questions.forEach((question) => {
        submittedAnswers[question.id] = formData.get(String(question.id))?.toString().trim() || '';
      });
      await submitQuiz(quiz.id, submittedAnswers, currentQuizStartAt, runner);
    });

    closeButton.addEventListener('click', () => {
      stopActiveQuizTimer();
      runner.innerHTML = '';
    });

    runner.innerHTML = '';
    runner.appendChild(container);
  } catch (error) {
    runner.innerHTML = '<div class="message">Unable to load the quiz right now.</div>';
  }
};

const loadResourcesStudent = async () => {
  const container = document.getElementById('resource-list');
  container.textContent = 'Loading...';
  const result = await apiRequest('/resources?verified=true');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load resources.';
    return;
  }
  renderResources(container, result);
};

const loadResources = async () => {
  const container = document.getElementById('resource-list');
  container.textContent = 'Loading...';
  const result = await apiRequest('/resources');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load resources.';
    return;
  }
  renderResources(container, result, { showActions: true });
};

const loadQuizzes = async () => {
  const container = document.getElementById('quiz-list');
  container.textContent = 'Loading...';
  const result = await apiRequest('/quizzes');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load quizzes.';
    return;
  }
  container.innerHTML = '';
  if (result.length === 0) {
    container.appendChild(createEmptyState('No quizzes created yet.'));
    return;
  }
  const rows = result.map((quiz) => ({
    Title: quiz.title,
    Topic: quiz.topic || '—',
    Type: quiz.type || '—',
    'Time limit': quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : 'No limit',
    'Assigned students': quiz.assignedCount || 0,
    CreatedAt: quiz.createdAt,
  }));
  container.appendChild(buildTable(['Title', 'Topic', 'Type', 'Time limit', 'Assigned students', 'CreatedAt'], rows));
};

const initializeTeacherDashboard = async () => {
  const user = await ensureAuthenticated();
  if (!user || user.role !== 'teacher') {
    return;
  }

  document.getElementById('teacher-name').textContent = user.name;
  const teacherAvatarEl = document.getElementById('teacher-avatar');
  if (teacherAvatarEl) {
    const initials = (user.name || '').split(' ').map((name) => name[0]).filter(Boolean).slice(0, 2).join('');
    teacherAvatarEl.textContent = initials.toUpperCase();
  }
  document.getElementById('logout-button').addEventListener('click', logout);

  const teacherActionGrid = document.getElementById('teacher-action-grid');
  if (teacherActionGrid) {
    teacherActionGrid.querySelectorAll('[data-show-sections]').forEach((button) => {
      button.addEventListener('click', () => {
        const targetIds = button.dataset.showSections.split(',').map((value) => value.trim()).filter(Boolean);
        showCards(targetIds, 'teacher-action-grid', 'show-actions-button', 'teacher-action-card');
      });
    });
  }
  const showTeacherActionsButton = document.getElementById('show-actions-button');
  if (showTeacherActionsButton) {
    showTeacherActionsButton.addEventListener('click', () => showActionMenu('teacher-action-grid', 'show-actions-button', 'teacher-action-card'));
  }

  const studentForm = document.getElementById('student-form');
  const studentMessage = document.getElementById('student-message');
  const resourceForm = document.getElementById('resource-form');
  const resourceMessage = document.getElementById('resource-message');
  const aiQuizForm = document.getElementById('ai-quiz-form');
  const aiQuizMessage = document.getElementById('ai-quiz-message');
  const teacherForm = document.getElementById('teacher-form');
  const teacherMessage = document.getElementById('teacher-message');

  studentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    studentMessage.textContent = '';
    const formData = new FormData(studentForm);
    const body = {
      name: formData.get('name').toString().trim(),
      username: formData.get('username').toString().trim(),
      password: formData.get('password').toString(),
    };
    const result = await apiRequest('/teachers/students', 'POST', body);
    studentMessage.textContent = result.message || result.error || 'Unable to add student.';
    loadStudents();
    studentForm.reset();
  });

  // Create teacher form handler
  if (teacherForm) {
    teacherForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      teacherMessage.textContent = '';
      const formData = new FormData(teacherForm);
      const body = {
        name: formData.get('name').toString().trim(),
        username: formData.get('username').toString().trim(),
        password: formData.get('password').toString(),
      };
      const result = await apiRequest('/teachers/add-teacher', 'POST', body);
      teacherMessage.textContent = result.message || result.error || 'Unable to add teacher.';
      teacherForm.reset();
    });
  }
 
  const createQuizForm = document.getElementById('create-quiz-form');
  const createQuizMessage = document.getElementById('create-quiz-message');
  const addQuestionButton = document.getElementById('add-question-button');
  const questionBuilder = document.getElementById('question-builder');
  let questionIndex = 1;

  if (addQuestionButton && questionBuilder) {
    addQuestionButton.addEventListener('click', () => {
      questionBuilder.appendChild(buildQuestionRow(questionIndex));
      questionIndex += 1;
    });
  }

  if (createQuizForm) {
    createQuizForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (createQuizMessage) createQuizMessage.textContent = '';

      const formData = new FormData(createQuizForm);
      const questions = collectQuizQuestions(createQuizForm);
      if (questions.length === 0) {
        if (createQuizMessage) createQuizMessage.textContent = 'Please add at least one question before creating the quiz.';
        return;
      }

      const body = {
        title: formData.get('title').toString().trim(),
        description: formData.get('description').toString().trim(),
        topic: formData.get('topic').toString().trim(),
        type: formData.get('type').toString().trim(),
        timeLimitMinutes: formData.get('timeLimitMinutes').toString(),
        questions,
      };

      const result = await apiRequest('/quizzes', 'POST', body);
      if (createQuizMessage) createQuizMessage.textContent = result.message || result.error || 'Unable to create quiz.';
      if (result.message) {
        createQuizForm.reset();
        questionBuilder.innerHTML = '';
        questionBuilder.appendChild(buildQuestionRow(0));
        questionIndex = 1;
        loadQuizzes();
      }
    });
  }
 
  resourceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    resourceMessage.textContent = '';
    const formData = new FormData(resourceForm);
    const body = {
      title: formData.get('title').toString().trim(),
      url: formData.get('url').toString().trim(),
      description: formData.get('description').toString().trim(),
    };
    const result = await apiRequest('/resources', 'POST', body);
    resourceMessage.textContent = result.message || result.error || 'Unable to upload resource.';
    loadResources();
    resourceForm.reset();
  });

  aiQuizForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    aiQuizMessage.textContent = '';
    const formData = new FormData(aiQuizForm);
    const targetStudentIds = getSelectedStudentIds(aiQuizForm, 'targetStudentIds');
    const body = {
      subject: formData.get('subject').toString().trim(),
      topic: formData.get('topic').toString().trim(),
      type: formData.get('type').toString().trim(),
      timeLimitMinutes: formData.get('timeLimitMinutes').toString(),
      assignToAll: Boolean(formData.get('assignToAll')),
      targetStudentIds,
    };
    const result = await apiRequest('/ai/quizzes', 'POST', body);
    aiQuizMessage.textContent = result.message || result.error || 'Unable to generate AI quiz.';
    loadQuizzes();
    aiQuizForm.reset();
    const aiStudentList = document.getElementById('ai-quiz-student-list');
    if (aiStudentList) renderStudentSelector(aiStudentList, 'targetStudentIds');
  });

  const assignQuizForm = document.getElementById('assign-quiz-form');
  const assignMessage = document.getElementById('assign-message');
  if (assignQuizForm) {
    assignQuizForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (assignMessage) assignMessage.textContent = '';
      const formData = new FormData(assignQuizForm);
      const studentIds = getSelectedStudentIds(assignQuizForm, 'studentIds');
      const body = {
        quizId: formData.get('quizId').toString().trim(),
        assignToAll: Boolean(formData.get('assignToAll')),
        studentIds,
      };
      const result = await apiRequest('/teachers/assign-quiz', 'POST', body);
      if (assignMessage) assignMessage.textContent = result.message || result.error || 'Unable to assign quiz.';
      assignQuizForm.reset();
      const assignStudentList = document.getElementById('assign-quiz-student-list');
      if (assignStudentList) renderStudentSelector(assignStudentList, 'studentIds');
    });
  }

  document.getElementById('load-students').addEventListener('click', loadStudents);
  document.getElementById('load-resources').addEventListener('click', loadResources);
  document.getElementById('load-quizzes').addEventListener('click', loadQuizzes);

  const loadPerformanceSummary = async () => {
    const container = document.getElementById('student-performance');
    container.textContent = 'Loading performance summary...';
    const result = await apiRequest('/teachers/performance/summary');
    if (!result || !Array.isArray(result.students)) {
      container.textContent = result.error || 'Unable to load performance summary.';
      return;
    }
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'performance-summary';
    header.innerHTML = `<div class="metric"><div class="metric-value">${result.meanAveragePercent}%</div><div class="metric-label">Mean avg. score (all students)</div></div>`;
    container.appendChild(header);

    const rows = result.students.map((s) => ({ Rank: s.rank, Student: s.name, Username: s.username, Attempts: s.attempts, 'Avg %': s.averagePercent }));
    container.appendChild(buildTable(['Rank', 'Student', 'Username', 'Attempts', 'Avg %'], rows));
  };

  const perfBtn = document.getElementById('load-performance-summary');
  if (perfBtn) perfBtn.addEventListener('click', loadPerformanceSummary);

  const resultsForm = document.getElementById('results-form');
  const resultsMessage = document.getElementById('results-message');

  resultsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    resultsMessage.textContent = '';
    const quizId = new FormData(resultsForm).get('quizId').toString().trim();
    const result = await apiRequest(`/quizzes/${quizId}/results`);
    if (!Array.isArray(result)) {
      resultsMessage.textContent = result.error || 'Unable to load results.';
      return;
    }
    const rows = result.map((item) => ({
      Student: item.studentName,
      Score: formatScoreValue(item),
      'Date taken': formatDate(item.takenAt),
      Feedback: item.feedback || '—',
    }));
    const container = document.getElementById('results-list');
    container.innerHTML = '';
    if (rows.length === 0) {
      container.appendChild(createEmptyState('No results for this quiz yet.'));
      return;
    }
    container.appendChild(buildTable(['Student', 'Score', 'Date taken', 'Feedback'], rows));
    resultsMessage.textContent = `Loaded ${rows.length} result(s).`;
  });

  showActionMenu('teacher-action-grid', 'show-actions-button', 'teacher-action-card');
  loadStudents();
  loadResources();
  loadQuizzes();
};

const loadStudents = async () => {
  const container = document.getElementById('student-list');
  container.textContent = 'Loading...';
  const result = await apiRequest('/teachers/students');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load students.';
    return;
  }
  teacherStudents = result;
  const aiStudentList = document.getElementById('ai-quiz-student-list');
  const assignStudentList = document.getElementById('assign-quiz-student-list');
  if (aiStudentList) renderStudentSelector(aiStudentList, 'targetStudentIds');
  if (assignStudentList) renderStudentSelector(assignStudentList, 'studentIds');
  container.innerHTML = '';
  if (result.length === 0) {
    container.appendChild(createEmptyState('No students yet.'));
    return;
  }

  const rows = result.map((student) => ({
    Name: student.name,
    Username: student.username,
    'Quizzes taken': student.quizzesTaken,
    'Average score': student.averageScore,
    'Date taken': student.lastTakenAt ? formatDate(student.lastTakenAt) : '—',
    Action: '',
  }));

  const table = buildTable(['Name', 'Username', 'Quizzes taken', 'Average score', 'Date taken', 'Action'], rows);
  const actionCells = table.querySelectorAll('tr');
  actionCells.forEach((row, index) => {
    if (index === 0) {
      return;
    }
    const actionCell = row.cells[row.cells.length - 1];
    const button = document.createElement('button');
    button.textContent = 'View';
    button.className = 'secondary';
    button.addEventListener('click', async () => {
      const student = result[index - 1];
      await loadStudentPerformance(student.id);
    });
    actionCell.appendChild(button);
  });
  container.appendChild(table);
};

const loadStudentPerformance = async (studentId) => {
  const container = document.getElementById('student-performance');
  container.textContent = 'Loading...';
  const result = await apiRequest(`/teachers/students/${studentId}/performance`);
  if (!result.student) {
    container.textContent = result.error || 'Unable to load student performance.';
    return;
  }

  container.innerHTML = '';
  const summary = document.createElement('div');
  summary.className = 'performance-summary';
  const metrics = [
    { label: 'Quizzes taken', value: result.performance.quizzesTaken },
    { label: 'Average score', value: `${result.performance.averageScore}/10` },
    { label: 'Last taken', value: result.performance.lastTakenAt ? formatDate(result.performance.lastTakenAt) : 'No attempts yet' },
  ];
  metrics.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = `<div class="metric-value">${metric.value}</div><div class="metric-label">${metric.label}</div>`;
    summary.appendChild(card);
  });
  container.appendChild(summary);

  if (!Array.isArray(result.results) || result.results.length === 0) {
    container.appendChild(createEmptyState(`${result.student.name} has no quiz results yet.`));
    return;
  }

  const rows = result.results.map((item) => ({
    Quiz: item.quizTitle,
    Topic: item.topic || '—',
    Type: item.type || '—',
    Score: formatScoreValue(item),
    'Date taken': formatDate(item.takenAt),
    Feedback: item.feedback || '—',
  }));
  container.appendChild(buildTable(['Quiz', 'Topic', 'Type', 'Score', 'Date taken', 'Feedback'], rows));
};

const initializeStudentDashboard = async () => {
  const user = await ensureAuthenticated();
  if (!user || user.role !== 'student') {
    return;
  }

  document.getElementById('student-name').textContent = user.name;
  const studentAvatarEl = document.getElementById('student-avatar');
  if (studentAvatarEl) {
    const initials = (user.name || '').split(' ').map((name) => name[0]).filter(Boolean).slice(0, 2).join('');
    studentAvatarEl.textContent = initials.toUpperCase();
  }
  document.getElementById('logout-button').addEventListener('click', logout);

  const studentActionGrid = document.getElementById('student-action-grid');
  if (studentActionGrid) {
    studentActionGrid.querySelectorAll('[data-show-sections]').forEach((button) => {
      button.addEventListener('click', () => {
        const targetIds = button.dataset.showSections.split(',').map((value) => value.trim()).filter(Boolean);
        showCards(targetIds, 'student-action-grid', 'student-show-actions-button', 'student-action-card');
      });
    });
  }
  const showStudentActionsButton = document.getElementById('student-show-actions-button');
  if (showStudentActionsButton) {
    showStudentActionsButton.addEventListener('click', () => showActionMenu('student-action-grid', 'student-show-actions-button', 'student-action-card'));
  }

  document.getElementById('load-resources').addEventListener('click', loadResourcesStudent);
  document.getElementById('load-results').addEventListener('click', loadPerformance);

  const tipsForm = document.getElementById('tips-form');
  const tipsMessage = document.getElementById('tips-message');

  tipsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    tipsMessage.textContent = '';
    const formData = new FormData(tipsForm);
    const body = { summary: formData.get('summary').toString().trim() };
    const result = await apiRequest('/ai/study-tips', 'POST', body);
    tipsMessage.textContent = result.message || result.error || 'Unable to generate tips.';
    tipsForm.reset();
    loadTips();
  });

  showActionMenu('student-action-grid', 'student-show-actions-button', 'student-action-card');
  loadAssignedQuizzes();
  loadResourcesStudent();
  loadPerformance();
  loadJourney();
  loadRecommendations();
  loadTips();
};

const loadAssignedQuizzes = async () => {
  const container = document.getElementById('quiz-list');
  container.textContent = 'Loading...';
  const result = await apiRequest('/quizzes');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load quizzes.';
    return;
  }
  container.innerHTML = '';
  if (result.length === 0) {
    container.appendChild(createEmptyState('No quizzes have been assigned to you yet.'));
    return;
  }

  result.forEach((quiz) => {
    const card = document.createElement('article');
    card.className = 'quiz-card';
    card.innerHTML = `
      <strong>${quiz.title}</strong>
      <p>${quiz.description || 'No description provided.'}</p>
      <small>Topic: ${quiz.topic || '—'} • Type: ${quiz.type || '—'} • Time limit: ${quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min` : 'No limit'}</small>
    `;
    const button = document.createElement('button');
    button.textContent = 'Start quiz';
    button.className = 'secondary';
    button.addEventListener('click', () => openQuizRunner(quiz));
    card.appendChild(button);
    container.appendChild(card);
  });
};

const loadJourney = async () => {
  const summaryContainer = document.getElementById('journey-summary');
  const listContainer = document.getElementById('journey-list');
  if (!summaryContainer || !listContainer) {
    return;
  }

  summaryContainer.textContent = 'Loading your journey...';
  listContainer.textContent = '';

  const result = await apiRequest('/quizzes/me/missions');
  if (!result || !Array.isArray(result.missions)) {
    summaryContainer.textContent = result?.error || 'Unable to load your learning journey.';
    return;
  }

  summaryContainer.innerHTML = `
    <div class="performance-summary">
      <div class="metric"><div class="metric-value">${result.completedCount}/${result.totalMissions}</div><div class="metric-label">missions completed</div></div>
      <div class="metric"><div class="metric-value">${result.nextMission ? result.nextMission.title : 'All done!'}</div><div class="metric-label">next mission</div></div>
    </div>
  `;

  if (result.missions.length === 0) {
    listContainer.appendChild(createEmptyState('No journey steps are available yet.'));
    return;
  }

  result.missions.forEach((mission) => {
    const completed = Number(mission.completed) === 1;
    const card = document.createElement('article');
    card.className = 'quiz-card';
    card.innerHTML = `
      <strong>${mission.icon || '🏅'} ${mission.title}</strong>
      <p>${mission.description}</p>
      <small>Topic: ${mission.topic || 'General'}</small>
      <p style="margin: 0.5rem 0 0; font-weight: 600; color: ${completed ? '#16a34a' : '#475569'};">${completed ? 'Completed' : 'In progress'}</p>
    `;
    listContainer.appendChild(card);
  });
};

const loadRecommendations = async () => {
  const journeySummary = document.getElementById('journey-summary');
  if (!journeySummary) {
    return;
  }

  const result = await apiRequest('/quizzes/me/recommendations');
  if (!result || !Array.isArray(result.recommended)) {
    return;
  }

  if (result.recommended.length > 0) {
    const recommender = document.createElement('div');
    recommender.className = 'message';
    recommender.innerHTML = `<strong>Recommended next missions:</strong> ${result.recommended.map((item) => item.title).join(', ')}`;
    journeySummary.appendChild(recommender);
  }
};

const loadPerformance = async () => {
  const container = document.getElementById('performance-list');
  const summaryContainer = document.getElementById('performance-summary');
  if (!container || !summaryContainer) {
    return;
  }

  container.textContent = 'Loading...';
  const result = await apiRequest('/quizzes/me/results');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load performance data.';
    return;
  }

  summaryContainer.innerHTML = '';
  summaryContainer.appendChild(buildPerformanceSummary(result));

  container.innerHTML = '';
  if (result.length === 0) {
    container.appendChild(createEmptyState('No quiz results yet.'));
    return;
  }

  const rows = result.map((item) => ({
    Quiz: item.quizTitle,
    Topic: item.topic || '—',
    Type: item.type || '—',
    Score: formatScoreValue(item),
    'Date taken': formatDate(item.takenAt),
    Feedback: item.feedback || '—',
  }));
  container.appendChild(buildTable(['Quiz', 'Topic', 'Type', 'Score', 'Date taken', 'Feedback'], rows));
};

const loadTips = async () => {
  const container = document.getElementById('tips-list');
  if (!container) {
    return;
  }
  container.textContent = 'Loading...';
  const result = await apiRequest('/ai/study-tips');
  if (!Array.isArray(result)) {
    container.textContent = result.error || 'Unable to load tips.';
    return;
  }
  container.innerHTML = '';
  if (result.length === 0) {
    container.appendChild(createEmptyState('No study tips generated yet.'));
    return;
  }
  result.forEach((tip) => {
    const article = document.createElement('article');
    article.className = 'quiz-card';
    article.innerHTML = `<p>${tip.tip}</p><small>Generated at ${formatDate(tip.createdAt)}</small>`;
    container.appendChild(article);
  });
};

const autoRedirectAuthenticated = async () => {
  const token = localStorage.getItem('stemliftToken');
  if (!token) {
    return;
  }

  const profile = await apiRequest('/profile');
  if (profile.user) {
    redirectToRoleDashboard(profile.user.role);
  }
};

if (document.getElementById('login-form')) {
  autoRedirectAuthenticated();
  initializeLogin();
}
if (document.getElementById('teacher-name')) {
  initializeTeacherDashboard();
}
if (document.getElementById('student-name')) {
  initializeStudentDashboard();
}
