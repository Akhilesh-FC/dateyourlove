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

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  if (
    lat1 === null || lat1 === undefined || lng1 === null || lng1 === undefined ||
    lat2 === null || lat2 === undefined || lng2 === null || lng2 === undefined
  ) {
    return null;
  }

  const lat1Rad = toRadians(Number(lat1));
  const lng1Rad = toRadians(Number(lng1));
  const lat2Rad = toRadians(Number(lat2));
  const lng2Rad = toRadians(Number(lng2));
  const earthRadiusKm = 6371;

  const cosAngle =
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lng2Rad - lng1Rad) +
    Math.sin(lat1Rad) * Math.sin(lat2Rad);
  const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));

  return earthRadiusKm * Math.acos(clampedCosAngle);
};

const formatDistanceLabel = (distanceKm) => {
  if (distanceKm === null || distanceKm === undefined) return '';
  if (distanceKm < 1) return 'Less than 1 km away';
  return `${Math.round(distanceKm)} km away`;
};

module.exports = { calculateAge, toFullUrl, calculateDistanceKm, formatDistanceLabel };