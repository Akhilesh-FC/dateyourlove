// Static dropdown data for the registration screens.
// Har list ki apni alag API hai — frontend jo dropdown bana raha hai
// usi ke naam se seedha call kar sakta hai.

const LOOKING_FOR = [
  'Long-term relationship',
  'Short-term relationship',
  "We'll see (if the feeling is right)",
  'Friendship',
  'Hangout',
  'Something casual',
  'Still figuring it out',
];

const RELIGIONS = [
  'Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Spiritual', 'Agnostic', 'Other',
];

const LANGUAGES = [
  'English', 'Hindi', 'Punjabi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada',
];

const SMOKING_OPTIONS = ['Never', 'Sometimes', 'Regularly'];
const DRINKING_OPTIONS = ['Never', 'Socially', 'Regularly'];
const WORKOUT_OPTIONS = ['Never', 'Sometimes', 'Often'];
const DIET_OPTIONS = ['Veg', 'Non-veg', 'Vegan'];

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