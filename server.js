const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");
const exerciseRoutes = require("./routes/exerciseRoutes");
const challengeRoutes = require("./routes/challengeRoutes");
const planRoutes = require("./routes/planRoutes");

const app = express();

const corsAllowedOrigins = [
  "http://localhost:5173",
  "https://dashboardnotification.web.app",
];

app.use(
  cors({
    origin: corsAllowedOrigins,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Fitness Exercises API" });
});

app.use("/api/exercises", exerciseRoutes);
app.use("/api/challenges", challengeRoutes);
app.use('/api/plans',planRoutes);

app.use((err, req, res, next) => {
  const status = err?.status || 500;
  const message = err?.message || "Server error";

  if (err?.code === 11000) {
    return res.status(409).json({
      ok: false,
      message: "Duplicate key error",
      details: err?.keyValue || {},
    });
  }

  return res.status(status).json({ ok: false, message });
});

const port = process.env.PORT || 3000;

async function start() {
  await connectDB();
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

