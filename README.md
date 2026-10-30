# Streaks

A habit tracker that keeps your streaks going and shows your whole year as a GitHub-style contribution grid.

**Live:** https://lazarzec18.github.io/streaks/

![Streaks screenshot](screenshot.png)

## What it does

- Tracks habits you want to do every day, or a set number of times a week (like running 3 times a week).
- One tap on "Done today" checks a habit off. Missed a tick? Click any past day in the grid to fix it.
- Shows a year heatmap of every habit together. The more habits you finished on a day, the brighter that square.
- Gives each habit its current streak, longest streak and completion over the last 30 days, plus a 12-week mini grid.
- Lets you rename, reorder, archive and delete habits, and export or import a JSON backup so you never lose your history.
- Saves everything on your device, and keeps working offline.

## How it works

Each check-in is stored as a local calendar date like `2026-10-30`, taken from your device clock rather than UTC, so a 7am tick in Perth never lands on yesterday. All date maths runs on the calendar itself, so daylight saving changes can't add or drop a day. A daily streak counts back from today, or from yesterday if today isn't ticked yet, so a streak stays alive until the day is actually over. Weekly habits count Monday-to-Sunday weeks that hit their target, and the week in progress never breaks a streak.

## Built with

HTML, CSS and JavaScript. No frameworks, no build step.

## Run it locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000.

---

Made by [Lazar Zec](https://github.com/LAZARZEC18)
