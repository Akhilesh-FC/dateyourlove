// Static dropdown data for the registration screens.
// Har item ab { id, title } object hai, taaki frontend id ko value ki tarah
// bhej sake (aur title ko dropdown me dikha sake).

const toIdTitleList = (titles) => titles.map((title, index) => ({ id: index + 1, title }));

const LOOKING_FOR = toIdTitleList([
  'Long-term relationship',
  'Short-term relationship',
  "We'll see (if the feeling is right)",
  'Friendship',
  'Hangout',
  'Something casual',
  'Still figuring it out',
]);

const RELIGIONS = toIdTitleList([
  'Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Spiritual', 'Agnostic', 'Other',
]);

const LANGUAGES = toIdTitleList([
  'English', 'Hindi', 'Punjabi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada',
]);

const SMOKING_OPTIONS = toIdTitleList(['Never', 'Sometimes', 'Regularly']);
const DRINKING_OPTIONS = toIdTitleList(['Never', 'Socially', 'Regularly']);
const WORKOUT_OPTIONS = toIdTitleList(['Never', 'Sometimes', 'Often']);
const DIET_OPTIONS = toIdTitleList(['Veg', 'Non-veg', 'Vegan']);

exports.getLookingForOptions = (req, res) => {
  return res.status(200).json({ lookingFor: LOOKING_FOR });
};

exports.getReligionOptions = (req, res) => {
  return res.status(200).json({ religions: RELIGIONS });
};

exports.getLanguageOptions = (req, res) => {
  return res.status(200).json({ languages: LANGUAGES });
};

exports.getSmokingOptions = (req, res) => {
  return res.status(200).json({ smoking: SMOKING_OPTIONS });
};

exports.getDrinkingOptions = (req, res) => {
  return res.status(200).json({ drinking: DRINKING_OPTIONS });
};

exports.getWorkoutOptions = (req, res) => {
  return res.status(200).json({ workout: WORKOUT_OPTIONS });
};

exports.getDietOptions = (req, res) => {
  return res.status(200).json({ diet: DIET_OPTIONS });
};

// ---------- Sabhi lists ek hi API me, har ek apni alag heading/key ke niche ----------
exports.getAllOptions = (req, res) => {
  return res.status(200).json({
    lookingFor: LOOKING_FOR,
    religions: RELIGIONS,
    languages: LANGUAGES,
    smoking: SMOKING_OPTIONS,
    drinking: DRINKING_OPTIONS,
    workout: WORKOUT_OPTIONS,
    diet: DIET_OPTIONS,
  });
};