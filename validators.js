const validateUsername = (username) =>
  typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,30}$/.test(username);

const validatePassword = (password) =>
  typeof password === 'string' && password.length >= 8 && password.length <= 128 && /^\S+$/.test(password);

const validateName = (name) =>
  typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80;

const validateTitle = (title) =>
  typeof title === 'string' && title.trim().length > 0 && title.trim().length <= 200;

const validateDescription = (description) =>
  description === undefined || (typeof description === 'string' && description.trim().length <= 1000);

const validateUrl = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const validateResetToken = (token) =>
  typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

const validateSummary = (summary) =>
  typeof summary === 'string' && summary.trim().length > 0 && summary.trim().length <= 2000;

module.exports = {
  validateUsername,
  validatePassword,
  validateName,
  validateTitle,
  validateDescription,
  validateUrl,
  parsePositiveInt,
  validateResetToken,
  validateSummary,
};
