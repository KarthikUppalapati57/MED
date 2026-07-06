const COMMON_PASSWORD_PARTS = [
  'password',
  'passw0rd',
  'restops',
  'restaurant',
  'qwerty',
  'admin',
  'administrator',
  'welcome',
  'letmein',
  'login',
  'tenant',
  'company',
  'business',
  'changeme',
  'default',
  '123456',
  '123456789',
];

const SEQUENTIAL_PATTERNS = [
  '0123456789',
  '9876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiop',
  'poiuytrewq',
  'asdfghjkl',
  'lkjhgfdsa',
  'zxcvbnm',
  'mnbvcxz',
];

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_DESCRIPTION =
  'Use 12-128 characters with uppercase, lowercase, number, special character, no spaces, no common words, no sequences, and no personal information.';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function compact(value) {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

function getPersonalInfoParts({ email, fullName } = {}) {
  const parts = new Set();
  const emailValue = normalize(email);
  const localPart = emailValue.split('@')[0];
  if (localPart && localPart.length >= 4) parts.add(compact(localPart));

  normalize(fullName)
    .split(/\s+/)
    .map(compact)
    .filter((part) => part.length >= 4)
    .forEach((part) => parts.add(part));

  return [...parts];
}

function hasSequentialPattern(value) {
  const lowered = compact(value);
  if (lowered.length < 4) return false;
  return SEQUENTIAL_PATTERNS.some((pattern) => {
    for (let i = 0; i <= pattern.length - 4; i += 1) {
      if (lowered.includes(pattern.slice(i, i + 4))) return true;
    }
    return false;
  });
}

export function getPasswordPolicyChecks(password, context = {}) {
  const value = password || '';
  const lower = value.toLowerCase();
  const compacted = compact(value);
  const personalParts = getPersonalInfoParts(context);
  const currentPassword = context.currentPassword || '';

  return [
    {
      id: 'length',
      label: `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
      isValid: value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
    },
    { id: 'lowercase', label: 'At least one lowercase letter', isValid: /[a-z]/.test(value) },
    { id: 'uppercase', label: 'At least one uppercase letter', isValid: /[A-Z]/.test(value) },
    { id: 'number', label: 'At least one number', isValid: /[0-9]/.test(value) },
    { id: 'special', label: 'At least one special character', isValid: /[^A-Za-z0-9]/.test(value) },
    { id: 'spaces', label: 'No spaces or invisible whitespace', isValid: !/\s/.test(value) },
    {
      id: 'common',
      label: 'No common words such as password, admin, welcome, restaurant, or qwerty',
      isValid: !COMMON_PASSWORD_PARTS.some((part) => lower.includes(part)),
    },
    {
      id: 'repeated',
      label: 'No repeated character runs such as aaaa or 1111',
      isValid: !/(.)\1{3,}/.test(value),
    },
    {
      id: 'sequence',
      label: 'No sequential or keyboard patterns such as 1234, abcd, qwer, or asdf',
      isValid: !hasSequentialPattern(value),
    },
    {
      id: 'personal',
      label: 'Do not include your email name or full name',
      isValid: personalParts.length === 0 || !personalParts.some((part) => part && compacted.includes(part)),
    },
    {
      id: 'reuse',
      label: 'New password must be different from your current password',
      isValid: !currentPassword || value !== currentPassword,
    },
  ];
}

export function validatePasswordPolicy(password, context = {}) {
  const checks = getPasswordPolicyChecks(password, context);
  const failures = checks.filter((check) => !check.isValid).map((check) => check.label);

  return {
    isValid: failures.length === 0,
    failures,
    checks,
    message: failures.length
      ? `Password does not meet security requirements: ${failures.join('; ')}.`
      : '',
  };
}

export function validatePasswordConfirmation(password, confirmation) {
  if ((password || '') !== (confirmation || '')) {
    return {
      isValid: false,
      message: 'Passwords do not match. Re-enter the same new password in both fields.',
    };
  }

  return { isValid: true, message: '' };
}