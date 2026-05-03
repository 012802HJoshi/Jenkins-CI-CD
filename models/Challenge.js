const mongoose = require("mongoose");

const ChallengeDayMetaSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    muscleGroups: { type: [String], default: [] },
    exerciseCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ChallengeWeekSchema = new mongoose.Schema(
  {
    weekNumber: { type: Number, required: true, min: 1 },
    days: { type: [ChallengeDayMetaSchema], default: [] },
  },
  { _id: false }
);

const ChallengeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    goal: {
      type: String,
      enum: ["weight_loss", "muscle_building", "stay_fit", "mobility_relax"],
      default: "muscle_building",
    },
    premium: { type: Boolean, default: false },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
    },
    durationDays: { type: Number, required: true, min: 1 },
    weeks: { type: [ChallengeWeekSchema], default: [] },
    banner_male: { type: String, default: "", trim: true },
    banner_female: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

ChallengeSchema.index({ difficulty: 1, goal: 1 });

// Enforce week/day invariants:
// - weekNumber sequence is exactly 1..weeks.length
// - every non-last week has exactly 7 days; the last week may be partial (1..7)
// - day values across all weeks cover 1..durationDays exactly (unique, no gaps)
ChallengeSchema.pre("validate", function ensureWeekDayInvariants(next) {
  if (!this.isModified("weeks") && !this.isModified("durationDays") && !this.isNew) {
    return next();
  }

  const weeks = Array.isArray(this.weeks) ? this.weeks : [];
  const durationDays = this.durationDays;

  if (!Number.isInteger(durationDays) || durationDays < 1) {
    return next(new Error("durationDays must be a positive integer"));
  }

  for (let i = 0; i < weeks.length; i += 1) {
    const w = weeks[i];
    if (w.weekNumber !== i + 1) {
      return next(new Error(`weeks[${i}].weekNumber must be ${i + 1} (got ${w.weekNumber})`));
    }
    const dayCount = Array.isArray(w.days) ? w.days.length : 0;
    const isLast = i === weeks.length - 1;
    if (!isLast && dayCount !== 7) {
      return next(new Error(`week ${w.weekNumber} must contain exactly 7 days (only the last week may be partial)`));
    }
    if (dayCount < 1 || dayCount > 7) {
      return next(new Error(`week ${w.weekNumber} must contain between 1 and 7 days (got ${dayCount})`));
    }
  }

  const allDays = weeks.flatMap((w) => (Array.isArray(w.days) ? w.days : []));
  if (allDays.length !== durationDays) {
    return next(
      new Error(`total day count across weeks (${allDays.length}) must equal durationDays (${durationDays})`)
    );
  }
  const dayNumbers = allDays.map((d) => d.day);
  const seen = new Set();
  for (const n of dayNumbers) {
    if (!Number.isInteger(n) || n < 1 || n > durationDays) {
      return next(new Error(`day values must be integers in 1..${durationDays} (got ${n})`));
    }
    if (seen.has(n)) {
      return next(new Error(`duplicate day index ${n} across weeks`));
    }
    seen.add(n);
  }
  for (let n = 1; n <= durationDays; n += 1) {
    if (!seen.has(n)) {
      return next(new Error(`missing day ${n} in weeks (must cover 1..${durationDays})`));
    }
  }

  return next();
});

module.exports = mongoose.model("Challenge", ChallengeSchema, "workouts");
