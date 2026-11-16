// Creates the first owner sign-in, or resets an existing user's password.
//   node --env-file=.env.local scripts/create-user.mjs --email you@example.com --name "Full Name"
//   node --env-file=.env.local scripts/create-user.mjs --email you@example.com --reset
// Everyone else is added from the Staff page, which emails them an invitation.
// The password is asked for at the prompt so it never lands in shell history.
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { MongoClient } from "mongodb";
import { hashPassword, passwordProblem } from "../src/lib/server/password.mjs";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "owner" },
    reset: { type: "boolean", default: false },
  },
});

const email = values.email?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Pass a valid --email.");
  process.exit(1);
}
if (!values.reset && !values.name?.trim()) {
  console.error('Pass --name "Full Name" for a new user.');
  process.exit(1);
}
// Same values as ROLES in src/lib/permissions.js.
if (!["owner", "manager", "front_desk", "warehouse"].includes(values.role)) {
  console.error("--role must be owner, manager, front_desk or warehouse.");
  process.exit(1);
}

// One reader for both questions, so piped input isn't swallowed by the first one.
// Typed characters aren't echoed: only the question text is written out.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let prompt = "";
rl._writeToOutput = (text) => {
  if (text.includes(prompt)) process.stdout.write(prompt);
};
const lines = rl[Symbol.asyncIterator]();

async function askHidden(question) {
  prompt = question;
  process.stdout.write(question);
  const { value = "" } = await lines.next();
  process.stdout.write("\n");
  return value;
}

const password = await askHidden("Password: ");
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
const repeated = await askHidden("Repeat password: ");
rl.close();
if (repeated !== password) {
  console.error("The passwords don't match.");
  process.exit(1);
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
try {
  const db = client.db(process.env.MONGODB_DB || "h2h-express");
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true });
  const now = new Date();
  const passwordHash = await hashPassword(password);

  if (values.reset) {
    const user = await users.findOneAndUpdate(
      { email },
      { $set: { passwordHash, passwordChangedAt: now, updatedAt: now, failedLogins: 0 }, $unset: { lockedUntil: "" } },
    );
    if (!user) {
      console.error(`No user with email ${email}.`);
      process.exitCode = 1;
    } else {
      // Signs them out everywhere so the old password's sessions stop working.
      await db.collection("sessions").deleteMany({ userId: user._id });
      console.log(`Password reset for ${email}.`);
    }
  } else if (await users.findOne({ email })) {
    console.error(`${email} already has a sign-in. Use --reset to change the password.`);
    process.exitCode = 1;
  } else {
    await users.insertOne({
      email,
      name: values.name.trim(),
      role: values.role,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created ${values.role} ${email}.`);
  }
} finally {
  await client.close();
}
