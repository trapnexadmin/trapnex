/**
 * MongoDB Connection Manager
 * Handles database connection with retry logic
 */

const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) {
    console.log("[MongoDB] Using existing connection");
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log("[MongoDB] ✓ Connected successfully");
    console.log(`[MongoDB] Database: ${mongoose.connection.name}`);

    mongoose.connection.on("error", (err) => {
      console.error("[MongoDB] Connection error:", err.message);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[MongoDB] Disconnected");
      isConnected = false;
    });

    mongoose.connection.on("reconnected", () => {
      console.log("[MongoDB] Reconnected");
      isConnected = true;
    });
  } catch (err) {
    console.error("[MongoDB] ✗ Connection failed:", err.message);
    console.log(
      "[MongoDB] Continuing without database - data will not persist",
    );
    isConnected = false;
  }
}

function isDBConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

async function closeDB() {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    console.log("[MongoDB] Connection closed");
  }
}

module.exports = { connectDB, isDBConnected, closeDB };
