console.log("🚀 Starting Express server...");
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3006;
const HOST = process.env.HOST || "0.0.0.0";

// Log environment variables
console.log("Environment PORT:", process.env.PORT);
console.log("Environment HOST:", process.env.HOST);
console.log("Using PORT:", PORT);
console.log("Using HOST:", HOST);

app.get("/", (req, res) => {
    console.log("GET / requested");
    res.send("Express is working!");
});

app.get("/health", (req, res) => {
    console.log("GET /health requested");
    res.json({status: "healthy", time: new Date().toISOString(), port: PORT});
});

app.listen(PORT, HOST, () => {
    console.log(`🎯 Server running on ${HOST}:${PORT}`);
    console.log("📋 Available routes:");
    console.log("  GET /");
    console.log("  GET /health");
});
