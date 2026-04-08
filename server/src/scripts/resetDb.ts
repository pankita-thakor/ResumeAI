/**
 * Drops the MongoDB database named in MONGODB_URI (e.g. resumeai).
 * Clears users, resumes, and all other collections in that DB only.
 *
 * Run: npm run reset-db -w server -- --yes
 * Or:  cd server && npx tsx src/scripts/resetDb.ts --yes
 */
import "../loadEnv.js";
import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/resumeai";

const ok =
  process.argv.includes("--yes") ||
  process.argv.includes("-y") ||
  process.env.RESET_DB_YES === "1";

if (!ok) {
  console.error(
    "This will DROP the entire MongoDB database from MONGODB_URI and delete all data.\n\n" +
      "From repo root (recommended):\n" +
      "  npm run reset-db:force\n" +
      "or:\n" +
      "  npm run reset-db -- --yes\n\n" +
      "From server folder:\n" +
      "  npx tsx src/scripts/resetDb.ts --yes\n\n" +
      "PowerShell env alternative:\n" +
      '  $env:RESET_DB_YES="1"; npm run reset-db -w server'
  );
  process.exit(1);
}

async function main() {
  await mongoose.connect(mongoUri);
  const name = mongoose.connection.db?.databaseName;
  await mongoose.connection.dropDatabase();
  console.log(`Dropped database "${name}" (${mongoUri.replace(/\/\/([^@]+@)?/, "//***@")}).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
