const mongoose = require("mongoose");

/**
 * Single connect per Node process. Mongoose uses the driver's connection pool:
 * requests reuse sockets from the pool — they do NOT open a new TCP connection per HTTP request.
 *
 * Pool options cap how many concurrent connections to MongoDB exist (bounds RAM vs throughput).
 * Tune maxPoolSize for your traffic and Atlas tier.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI in environment");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 60,
    minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || 0,
    serverSelectionTimeoutMS: 5000,
  });
}

module.exports = { connectDB };


