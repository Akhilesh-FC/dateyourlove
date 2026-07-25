const calculateAge = (dob) => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
};

// .env me BASE_URL=https://dateyourlove.poojify.in (bina trailing slash) set karo
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');

const toFullUrl = (relativePath) => {
  if (!relativePath) return relativePath;
  if (/^https?:\/\//i.test(relativePath)) return relativePath; // already absolute
  if (!BASE_URL) return relativePath; // BASE_URL set nahi hai to jaisa hai waisa hi
  return `${BASE_URL}${relativePath}`;
};

module.exports = { calculateAge, toFullUrl };