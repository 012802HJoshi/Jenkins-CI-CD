# Fitness Exercises (Express)

## Setup

```bash
npm install
```

## Environment

Create a `.env` file in the project root:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/fitness_exercises
PORT=3000
```

## Run

- Development (auto-reload):

```bash
npm run dev
```

- Production:

```bash
npm start
```

## Test the server

Open `http://localhost:3000/` in your browser.

## Create Exercise (example)

This endpoint accepts `multipart/form-data` and supports file uploads:

- `video` (file, optional)
- `thumbnail` (file, optional)

Example:

```bash
curl -X POST "http://localhost:3000/api/exercises" \
  -F "title=Alternating Dumbbell Curl" \
  -F "slug=alternating-dumbbell-curl" \
  -F "description=Basic curl exercise" \
  -F 'instructions=["Step 1","Step 2"]' \
  -F 'importantPoints=["Keep elbows in","Control the weight"]' \
  -F "muscleGroup=biceps" \
  -F "equipment=dumbbell" \
  -F "category=Arms" \
  -F "difficulty=beginner" \
  -F 'exerciseType=["strength"]' \
  -F "video=@./sample.mp4" \
  -F "thumbnail=@./thumb.jpg"
```

Uploaded files are served at `/uploads/...` and the saved `videoUrl` / `thumbnailUrl` will be those paths.

## Delete a GCS folder (example)

Deletes everything under `<slug>/` in your bucket and also deletes the exercise from MongoDB (by `slug`):

```bash
curl -X DELETE "http://localhost:3000/api/exercises/alternating-dumbbell-curl/folder"
```

## Create Workout (example)

```bash
curl -X POST "http://localhost:3000/api/workouts" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Push/Pull/Legs 6-Day - Muscle Building",
    "goal": "muscle_building",
    "daysPerWeek": 6,
    "weeks": 4,
    "weeklySchedule": [
      {
        "day": 1,
        "name": "Push A",
        "muscleGroups": ["chest", "shoulders", "triceps"],
        "exercises": [
          { "exerciseSlug": "push-up-burpees", "exerciseTitle": "Push up burpees", "sets": 4, "reps": "8-12", "restSeconds": 75 }
        ]
      }
    ]
  }'
```

List workouts:

```bash
curl "http://localhost:3000/api/workouts"
```

