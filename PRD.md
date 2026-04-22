# PRD: Fitness Backend 

## Overview

This document defines the `Exercise Type` classification for exercises in the Fitness Exercises backend. The goal is to provide a clear, consistent way to group exercises by training style so they can be stored, filtered, displayed, and recommended across the product.

Exercise content can vary widely across strength, cardio, mobility, and high-intensity formats. Without a consistent `Exercise Type` field:

## Backend Mapping

The current backend schema uses the following enum values:

| Stored Value           | Display Label           |
| ---------------------- | ----------------------- |
| `strength`             | Strength Training       |
| `cardio_endurence`     | Cardio & Endurance      |
| `flexibility_mobility` | Flexibility & Mobility  |
| `HIIT_circuit`         | HIIT & Circuit Training |

## Product Requirement

Each exercise must have one primary `Exercise Type`.

The current scope includes these four exercise types:

1. **Strength Training**
   Resistance-based exercises focused on building muscle and power.

   Examples:
   - weightlifting
   - bodyweight exercises
   - resistance band exercises

2. **Cardio & Endurance**
   Sustained aerobic activities that elevate heart rate and improve stamina.

   Examples:
   - running
   - cycling
   - swimming
   - jump rope

3. **Flexibility & Mobility**
   Stretching and range-of-motion work that improves movement quality and recovery.

   Examples:
   - yoga
   - static stretching
   - foam rolling
   - pilates

4. **HIIT & Circuit Training**
   High-intensity interval formats that combine strength and cardio in timed or repeated rounds.

   Examples:
   - Tabata
   - CrossFit-style workouts
   - bootcamp circuits

## Functional Requirements

- Every exercise record must include exactly one `Exercise Type`.
- The backend must store the value in a normalized format.
- The frontend must show a human-readable label.
- Users should be able to filter exercises by `Exercise Type`.
- `Exercise Type` should be usable in search, recommendations, and workout-building flows.



## Non-Goals

- Supporting multiple exercise types per single exercise in the current version
- Building subcategories such as "running", "powerlifting", or "mobility flow" in this phase
- Replacing existing fields like `category`, `equipment`, or `difficulty`

## Future Considerations

- Add a fifth type later if the product needs broader sport-specific or recovery-specific coverage.
- Standardize enum naming if the API is revised in a future version.
- Introduce subtype tags under each top-level exercise type for better recommendations.

## Success Criteria

- All exercise records can be classified into one of the supported exercise types.
- API consumers use a single consistent value for storage and filtering.
- Users can quickly understand what kind of training an exercise belongs to.

## Exercise Category

### Overview

This section defines the `Exercise Category` classification for exercises in the Fitness Exercises backend. While `Exercise Type` describes the training style, `Exercise Category` describes the primary body area or workout grouping associated with the exercise.

### Objective

Users should be able to browse and filter exercises by familiar body-part or training-group categories. The category system should stay simple, recognizable, and useful for workout planning.

### Problem Statement

Without a consistent `Exercise Category` field:

- users may struggle to browse exercises by target area
- workout-building flows become less intuitive
- category-based filtering can become inconsistent
- frontend and backend labels may drift over time

### Product Requirement

Each exercise must have one primary `Exercise Category`.

The current scope includes these eight exercise categories:

1. **Arms**
   Exercises that primarily target the biceps, triceps, and forearms.

   Examples:
   - bicep curls
   - tricep dips
   - hammer curls

2. **Chest**
   Exercises focused mainly on the pectoral muscles and pressing movement patterns.

   Examples:
   - push-ups
   - bench press
   - chest fly

3. **Legs**
   Exercises that primarily train the quadriceps, hamstrings, glutes, and calves.

   Examples:
   - squats
   - lunges
   - leg press

4. **Core**
   Exercises that strengthen the abdominals, obliques, and trunk stability muscles.

   Examples:
   - planks
   - crunches
   - leg raises

5. **Back**
   Exercises focused on the lats, traps, rhomboids, and related pulling muscles.

   Examples:
   - pull-ups
   - rows
   - lat pulldowns

6. **Shoulders**
   Exercises that primarily target the deltoids and supporting shoulder muscles.

   Examples:
   - shoulder press
   - lateral raises
   - front raises

7. **Full Body**
   Exercises or workouts that train multiple major muscle groups at the same time.

   Examples:
   - burpees
   - thrusters
   - kettlebell swings

8. **Yoga**
   Yoga-based movements and routines focused on flexibility, balance, breathing, and control.

   Examples:
   - sun salutations
   - warrior poses
   - downward dog flows

### Functional Requirements

- Every exercise record must include exactly one `Exercise Category`.
- The backend must store the category in a consistent format.
- The frontend must display a clear human-readable category label.
- Users should be able to filter exercises by `Exercise Category`.
- `Exercise Category` should work alongside `Exercise Type`, `difficulty`, `equipment`, and `gender` filters.

### Backend Mapping


### Suggested Display Mapping

| Stored Value | Display Label |
| ------------ | ------------- |
| `Arms`       | Arms          |
| `Chest`      | Chest         |
| `Legs`       | Legs          |
| `Core`       | Core          |
| `Back`       | Back          |
| `Shoulders`  | Shoulders     |
| `Full Body`  | Full Body     |
| `Yoga`       | Yoga          |

- All exercise records can be grouped into one supported exercise category.
- API consumers use consistent category values for filtering and display.
- Users can quickly find exercises based on target body area or workout grouping.
