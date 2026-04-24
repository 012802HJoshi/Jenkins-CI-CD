const Challenge = require("../models/Challenge");
const Exercise = require("../models/Exercise");
const mongoose = require("mongoose");
const { gcsupload } = require("../config/gcsupload");
const { gcsdelete } = require("../config/gcsdelete");

// GCS folder prefix for challenge plan uploads: challenges_plan/<slug>/
const CHALLENGE_PLAN_GCS_PREFIX = "challenges";

function challengeGcsFolder(slug) {
  const s = String(slug || "").trim();
  return `${CHALLENGE_PLAN_GCS_PREFIX}/${s}`;
}

function parseBoolean(value) {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function withForcedOriginalName(file, forcedName) {
  if (!file) return file;
  return { ...file, originalname: forcedName };
}

function extFromMime(mimetype) {
  if (!mimetype) return "jpg";
  if (mimetype.includes("png")) return "png";
  if (mimetype.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Resolves exerciseId from exerciseSlug and validates every slug exists in Exercise.
 * @returns {{ ok: true, payload: object } | { ok: false, status: number, message: string, missing?: string[] }}
 */
async function attachExerciseReferences(payload) {
  const normalized = { ...payload };
  const weeklySchedule = Array.isArray(payload?.weeklySchedule) ? payload.weeklySchedule : [];

  for (const day of weeklySchedule) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    for (const item of exercises) {
      const slug = String(item?.exerciseSlug || "").trim();
      if (!slug) {
        return {
          ok: false,
          status: 400,
          message: "exerciseSlug is required for every exercise in weeklySchedule",
        };
      }
    }
  }

  const allSlugs = weeklySchedule
    .flatMap((day) => (Array.isArray(day?.exercises) ? day.exercises : []))
    .map((item) => String(item?.exerciseSlug || "").trim())
    .filter(Boolean);

  if (!allSlugs.length) {
    return { ok: true, payload: normalized };
  }

  const uniqueSlugs = [...new Set(allSlugs)];
  const matchedExercises = await Exercise.find({ slug: { $in: uniqueSlugs } }, { _id: 1, slug: 1 });
  const matchedSet = new Set(matchedExercises.map((e) => e.slug));
  const missing = uniqueSlugs.filter((s) => !matchedSet.has(s));

  if (missing.length) {
    return {
      ok: false,
      status: 400,
      message: "one or more exercise slugs do not exist",
      missing,
    };
  }

  const slugToId = new Map(matchedExercises.map((item) => [item.slug, item._id]));

  normalized.weeklySchedule = weeklySchedule.map((day) => {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    return {
      ...day,
      exercises: exercises.map((item) => ({
        ...item,
        exerciseId: slugToId.get(String(item.exerciseSlug || "").trim()) || undefined,
      })),
    };
  });

  return { ok: true, payload: normalized };
}

async function createChallenge(req, res, next) {
  try {
    let payload = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;
    if (typeof req.body?.data === "string") {
      try {
        payload = JSON.parse(req.body.data);
      } catch {
        payload = req.body;
      }
    }

    const refsResult = await attachExerciseReferences(payload);
    if (!refsResult.ok) {
      return res.status(refsResult.status).json({
        ok: false,
        message: refsResult.message,
        ...(refsResult.missing?.length ? { missing: refsResult.missing } : {}),
      });
    }
    const payloadWithRefs = refsResult.payload;

    const name = String(payloadWithRefs?.name || "").trim();
    const slug = String(payloadWithRefs?.slug || "").trim();
    if (!name) {
      return res.status(400).json({ ok: false, message: "name is required" });
    }
    if (!slug) {
      return res.status(400).json({ ok: false, message: "slug is required" });
    }

    const diffRaw = String(payloadWithRefs.difficulty ?? "").trim();
    if (!diffRaw) {
      delete payloadWithRefs.difficulty;
    } else {
      payloadWithRefs.difficulty = diffRaw;
    }

    const folder = challengeGcsFolder(slug);
    const thumbFile = req.files?.thumbnail?.[0];
    const imageFile = req.files?.image?.[0];

    if (thumbFile) {
      const ext = extFromMime(thumbFile.mimetype);
      payloadWithRefs.bannerUrl = await gcsupload(
        folder,
        withForcedOriginalName(thumbFile, `thumbnail.${ext}`),
        false
      );
    }
    if (imageFile) {
      const ext = extFromMime(imageFile.mimetype);
      payloadWithRefs.imageUrl = await gcsupload(
        folder,
        withForcedOriginalName(imageFile, `image.${ext}`),
        false
      );
    }

    if (Object.prototype.hasOwnProperty.call(payloadWithRefs, "premium")) {
      const premium = parseBoolean(payloadWithRefs.premium);
      if (premium === undefined) {
        return res.status(400).json({ ok: false, message: "premium must be a boolean" });
      }
      payloadWithRefs.premium = premium;
    }

    const challenge = await Challenge.create(payloadWithRefs);
    return res.status(201).json({ ok: true, data: challenge });
  } catch (err) {
    return next(err);
  }
}

async function listChallenges(req, res, next) {
  try {
    const premium = parseBoolean(req.query.premium);
    if (req.query.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const filter = {};
    if (premium !== undefined) filter.premium = premium;

    const challenges = await Challenge.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id slug name goal premium difficulty daysPerWeek weeks bannerUrl imageUrl");
    return res.json({ ok: true, data: challenges });
  } catch (err) {
    return next(err);
  }
}

const CHALLENGE_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);

async function getChallengesByDifficulty(req, res, next) {
  try {
    const difficulty = String(req.params.difficulty || "").trim().toLowerCase();
    if (!difficulty || !CHALLENGE_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        ok: false,
        message: "difficulty must be one of: beginner, intermediate, advanced",
      });
    }

    const premium = parseBoolean(req.query.premium);
    if (req.query.premium !== undefined && premium === undefined) {
      return res.status(400).json({ ok: false, message: "premium must be a boolean" });
    }

    const filter = { difficulty };
    if (premium !== undefined) filter.premium = premium;

    const challenges = await Challenge.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("_id slug name goal premium difficulty daysPerWeek weeks bannerUrl imageUrl")
      .lean();

    return res.json({ ok: true, data: challenges });
  } catch (err) {
    return next(err);
  }
}

async function getChallengeBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      return res.status(400).json({ ok: false, message: "slug is required" });
    }

    const challenge = await Challenge.findOne({ slug }).populate(
      "weeklySchedule.exercises.exerciseId",
      "title slug muscleGroup equipment"
    );

    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    return res.json({ ok: true, data: challenge });
  } catch (err) {
    return next(err);
  }
}

async function getChallengeById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }

    const challenge = await Challenge.findById(id).populate(
      "weeklySchedule.exercises.exerciseId",
      "title slug muscleGroup equipment"
    );

    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    return res.json({ ok: true, data: challenge });
  } catch (err) {
    return next(err);
  }
}

async function deleteChallenge(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, message: "invalid challenge id" });
    }

    const challenge = await Challenge.findById(id).select("slug");
    if (!challenge) {
      return res.status(404).json({ ok: false, message: "challenge not found" });
    }

    const folderPrefix = challengeGcsFolder(challenge.slug);
    await gcsdelete(folderPrefix, false);

    await Challenge.deleteOne({ _id: id });

    return res.json({ ok: true, message: "challenge deleted", data: { gcsPrefix: `${folderPrefix}/` } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createChallenge,
  listChallenges,
  getChallengesByDifficulty,
  getChallengeById,
  getChallengeBySlug,
  deleteChallenge,
};
