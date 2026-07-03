const Exercise = require("../models/Exercise");
const Plan = require("../models/Plan");
const Challenge = require("../models/Challenge");

const MUSCLE_GROUP_OPTIONS = [
  "chest",
  "shoulders",
  "triceps",
  "back",
  "biceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "core",
  "calves",
  "full_body",
];

const EQUIPMENT_OPTIONS = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "cable",
  "machine",
  "kettlebell",
  "yoga mat",
];

const CATEGORY_OPTIONS = [
  "Arms",
  "Chest",
  "Legs",
  "Core",
  "Back",
  "Shoulders",
  "Full Body",
  "Yoga",
];

function getEnumValues(model, path) {
  const schemaPath = model.schema.path(path);
  return schemaPath?.enumValues ? [...schemaPath.enumValues] : [];
}

function uniqueValues(...lists) {
  return [...new Set(lists.flat())];
}

function buildEnumPayload() {
  const exerciseDifficulty = getEnumValues(Exercise, "difficulty");
  const exerciseType = getEnumValues(Exercise, "exerciseType");
  const exercisePremium = getEnumValues(Exercise, "premium");
  const planDifficulty = getEnumValues(Plan, "difficulty");
  const planGoal = getEnumValues(Plan, "goal");
  const planPremium = getEnumValues(Plan, "premium");
  const planFocusArea = getEnumValues(Plan, "focus_area");
  const challengeDifficulty = getEnumValues(Challenge, "difficulty");
  const challengeGoal = getEnumValues(Challenge, "goal");
  const challengePremium = getEnumValues(Challenge, "premium");

  const difficulty = uniqueValues(exerciseDifficulty, planDifficulty, challengeDifficulty);
  const goal = uniqueValues(planGoal, challengeGoal);
  const premium = uniqueValues(exercisePremium, planPremium, challengePremium);

  return {
    difficulty,
    goal,
    exerciseType,
    premium,
    focus_area: planFocusArea,
    focusArea: planFocusArea,
    muscleGroup: MUSCLE_GROUP_OPTIONS,
    equipment: EQUIPMENT_OPTIONS,
    category: CATEGORY_OPTIONS,
    byResource: {
      exercises: {
        difficulty: exerciseDifficulty,
        exerciseType,
        premium: exercisePremium,
        muscleGroup: MUSCLE_GROUP_OPTIONS,
        equipment: EQUIPMENT_OPTIONS,
        category: CATEGORY_OPTIONS,
      },
      plans: {
        difficulty: planDifficulty,
        goal: planGoal,
        premium: planPremium,
        focus_area: planFocusArea,
        focusArea: planFocusArea,
      },
      challenges: {
        difficulty: challengeDifficulty,
        goal: challengeGoal,
        premium: challengePremium,
      },
    },
  };
}

function getEnums(req, res) {
  return res.json({ ok: true, data: buildEnumPayload() });
}

module.exports = {
  getEnums,
  buildEnumPayload,
};
