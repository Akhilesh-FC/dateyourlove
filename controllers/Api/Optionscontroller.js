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
const ZODIAC_OPTIONS = toIdTitleList(['ries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']);
const EDUCATION_OPTIONS = toIdTitleList(['High school', "Bachelor's", "Master's", 'PhD', 'Trade school', 'Prefer not to say']);
const FAMILY_PLAN_OPTIONS = toIdTitleList(['Want kids', "Don't want kids", 'Have kids & want more', 'Have kids & don\'t want more', 'Not sure yet']);
const LOVE_STYLE_OPTIONS = toIdTitleList(['Words of affirmation', 'Acts of service', 'Receiving gifts', 'Quality time', 'Physical touch']);
const PETS_OPTIONS = toIdTitleList(['Dog', 'Cat', 'Both', 'Other pet', 'No pets, want one', 'No pets, not for me']);
const INTERESTS_OPTIONS = toIdTitleList(['Travel', 'Music', 'Fitness', 'Foodie', 'Movies', 'Reading', 'Art', 'Gaming', 'Yoga', 'Coffee']);
const RELATIONSHIP_TYPE_OPTIONS = toIdTitleList(['Monogamy', 'Non-monogamy', 'Figuring it out']);


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

exports.getZodiacOptions = (req, res) => {
  return res.status(200).json({ zodiac: ZODIAC_OPTIONS });
};

exports.getFamilyPlanOptions = (req, res) => {
  return res.status(200).json({ familyPlan: FAMILY_PLAN_OPTIONS });
};

exports.getLoveStyleOptions = (req, res) => {
  return res.status(200).json({ loveStyle: LOVE_STYLE_OPTIONS });
}

exports.getPetsOptions = (req, res) => {
  return res.status(200).json({ pets: PETS_OPTIONS });
}

  exports.getInterestsOptions = (req, res) => {   
    return res.status(200).json({ interests: INTERESTS_OPTIONS });    
  }

exports.getEducationOptions = (req, res) => {
  return res.status(200).json({ education: EDUCATION_OPTIONS });
};

exports.getRelationshipTypeOptions = (req, res) => {
  return res.status(200).json({ relationshipType: RELATIONSHIP_TYPE_OPTIONS });
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
    zodiac: ZODIAC_OPTIONS,
    familyPlan : FAMILY_PLAN_OPTIONS,
    loveStyle : LOVE_STYLE_OPTIONS,
    pets : PETS_OPTIONS,
    interests : INTERESTS_OPTIONS,
    education : EDUCATION_OPTIONS,
    relationshipType : RELATIONSHIP_TYPE_OPTIONS,

  });
};
