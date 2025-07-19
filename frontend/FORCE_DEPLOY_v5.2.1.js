// Force deployment v5.2.1 - Enhanced duplicate audio prevention
// This file forces Vercel to rebuild and deploy the latest changes
// Timestamp: 2025-01-18 15:30:00

export const DEPLOYMENT_VERSION = "v5.2.1";
export const DEPLOYMENT_TIMESTAMP = new Date().toISOString();
export const DEPLOYMENT_NOTES = "Strengthened duplicate audio prevention with proper state cleanup";

console.log("🚀 Forcing deployment", DEPLOYMENT_VERSION, DEPLOYMENT_TIMESTAMP);
