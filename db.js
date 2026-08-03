const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

const dbFile = path.join(__dirname, 'stemlift.db');
let db;
let SQL;

const openDatabase = async () => {
  if (db) {
    return db;
  }

  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
    });
  }

  if (fs.existsSync(dbFile)) {
    const fileData = fs.readFileSync(dbFile);
    db = new SQL.Database(new Uint8Array(fileData));
  } else {
    db = new SQL.Database();
  }

  return db;
};

const saveDatabase = async () => {
  if (!db) {
    return;
  }
  const data = db.export();
  fs.writeFileSync(dbFile, Buffer.from(data));
};

const run = async (sql, params = []) => {
  const database = await openDatabase();
  database.run(sql, params);
  const result = database.exec('SELECT last_insert_rowid() AS id');
  const lastID = result[0]?.values?.[0]?.[0] ?? null;
  await saveDatabase();
  return { lastID, changes: database.getRowsModified() };
};

const get = async (sql, params = []) => {
  const database = await openDatabase();
  const stmt = database.prepare(sql);
  try {
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  } catch (err) {
    stmt.free();
    throw err;
  }
};

const all = async (sql, params = []) => {
  const database = await openDatabase();
  const stmt = database.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (err) {
    stmt.free();
    throw err;
  }
};

const ensureColumn = async (table, column, definition) => {
  const database = await openDatabase();
  const tableInfo = database.exec(`PRAGMA table_info(${table})`);
  const columns = tableInfo[0]?.values?.map((row) => row[1]) || [];
  if (!columns.includes(column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

async function initialize() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    uploadedBy INTEGER,
    verified INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uploadedBy) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    createdBy INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(createdBy) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quizId INTEGER NOT NULL,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    answer TEXT NOT NULL,
    FOREIGN KEY(quizId) REFERENCES quizzes(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quizId INTEGER NOT NULL,
    studentId INTEGER NOT NULL,
    score INTEGER NOT NULL,
    takenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(quizId) REFERENCES quizzes(id),
    FOREIGN KEY(studentId) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quizId INTEGER NOT NULL,
    studentId INTEGER,
    assignedToAll INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(quizId) REFERENCES quizzes(id),
    FOREIGN KEY(studentId) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS ai_tips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId INTEGER NOT NULL,
    tip TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(studentId) REFERENCES users(id)
  )`);
 
  await run(`CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    topic TEXT,
    icon TEXT DEFAULT '🏅',
    orderIndex INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
 
  await run(`CREATE TABLE IF NOT EXISTS user_missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId INTEGER NOT NULL,
    missionId INTEGER NOT NULL,
    completedAt DATETIME,
    FOREIGN KEY(studentId) REFERENCES users(id),
    FOREIGN KEY(missionId) REFERENCES missions(id)
  )`);
 
  await run(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    token TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  )`);

  await ensureColumn('quizzes', 'topic', 'TEXT');
  await ensureColumn('quizzes', 'type', 'TEXT');
  await ensureColumn('quizzes', 'timeLimitMinutes', 'INTEGER DEFAULT 0');
  await ensureColumn('questions', 'acceptedAnswers', 'TEXT DEFAULT "[]"');
  await ensureColumn('quiz_results', 'feedback', 'TEXT');
  await ensureColumn('quiz_results', 'totalQuestions', 'INTEGER DEFAULT 0');
 
  const missionCount = await get('SELECT COUNT(*) AS count FROM missions');
  if (!missionCount || Number(missionCount.count) === 0) {
    const missions = [
      { title: 'Intro to Code', description: 'Complete your first quiz and earn your first badge.', topic: 'Technology', icon: '💻', orderIndex: 1 },
      { title: 'Math Mastery', description: 'Learn to solve problems with confidence in core math topics.', topic: 'Mathematics', icon: '🧮', orderIndex: 2 },
      { title: 'Science Explorer', description: 'Build curiosity by taking science quizzes and exploring new ideas.', topic: 'Science', icon: '🔬', orderIndex: 3 },
      { title: 'Future Innovator', description: 'Unlock creative thinking with tech and engineering challenges.', topic: 'Engineering', icon: '🚀', orderIndex: 4 },
    ];
    for (const mission of missions) {
      await run(
        'INSERT INTO missions (title, description, topic, icon, orderIndex) VALUES (?, ?, ?, ?, ?)',
        [mission.title, mission.description, mission.topic, mission.icon, mission.orderIndex]
      );
    }
  }
 
  const defaultTeacher = await get('SELECT id FROM users WHERE username = ?', ['teacher']);
  if (!defaultTeacher) {
    const passwordHash = await hashPassword('password123');
    await run(
      'INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
      ['teacher', passwordHash, 'teacher', 'Default Teacher']
    );
  }

  const defaultStudent = await get('SELECT id FROM users WHERE username = ?', ['student']);
  if (!defaultStudent) {
    const passwordHash = await hashPassword('student123');
    await run(
      'INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
      ['student', passwordHash, 'student', 'Default Student']
    );
  }
}

const hashPassword = async (plaintext) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plaintext, salt);
};

const verifyPassword = async (plaintext, hashed) => bcrypt.compare(plaintext, hashed);

const getUserByUsername = (username) => get('SELECT * FROM users WHERE username = ?', [username]);

const getUserById = (id) => get('SELECT id, username, role, name FROM users WHERE id = ?', [id]);

const createPasswordResetToken = (userId, token, expiresAt) =>
  run('INSERT INTO password_resets (userId, token, expiresAt) VALUES (?, ?, ?)', [userId, token, expiresAt]);
 
const getValidPasswordResetToken = (token) =>
  get(
    'SELECT id, userId, expiresAt FROM password_resets WHERE token = ? AND expiresAt > ?',
    [token, new Date().toISOString()]
  );
 
const deletePasswordResetToken = (token) => run('DELETE FROM password_resets WHERE token = ?', [token]);
 
const invalidatePasswordResetTokensForUser = (userId) => run('DELETE FROM password_resets WHERE userId = ?', [userId]);
 
const getAllMissions = () => all('SELECT id, title, description, topic, icon, orderIndex FROM missions ORDER BY orderIndex ASC');
 
const getStudentMissionStatuses = async (studentId) =>
  all(
    `SELECT m.id, m.title, m.description, m.topic, m.icon, m.orderIndex,
            CASE WHEN um.completedAt IS NOT NULL THEN 1 ELSE 0 END AS completed,
            um.completedAt
       FROM missions m
       LEFT JOIN user_missions um ON um.missionId = m.id AND um.studentId = ?
       ORDER BY m.orderIndex ASC`,
    [studentId]
  );
 
const completeMission = async (studentId, missionId) => {
  const existing = await get('SELECT id FROM user_missions WHERE studentId = ? AND missionId = ?', [studentId, missionId]);
  if (existing) {
    await run('UPDATE user_missions SET completedAt = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
  } else {
    await run('INSERT INTO user_missions (studentId, missionId, completedAt) VALUES (?, ?, CURRENT_TIMESTAMP)', [studentId, missionId]);
  }
};

module.exports = {
  run,
  get,
  all,
  initialize,
  hashPassword,
  verifyPassword,
  getUserByUsername,
  getUserById,
  createPasswordResetToken,
  getAllMissions,
  getStudentMissionStatuses,
  completeMission,
  getValidPasswordResetToken,
  deletePasswordResetToken,
  invalidatePasswordResetTokensForUser,
};
