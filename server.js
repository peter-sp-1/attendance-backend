import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = "fellowship";
let db;

// Try to connect to MongoDB
MongoClient.connect(mongoUri, { useUnifiedTopology: true })
  .then((client) => {
    db = client.db(dbName);
    console.log("Connected to MongoDB ✅");
  })
  .catch((err) => {
    console.error("MongoDB connection failed ❌. Falling back to memory.", err);
  });

// In-memory fallback storage
let inMemory = {
  members: [],
  sessions: [],
  attendance: [],
};

// --------- Database Helper Functions ----------
async function getCollection(name) {
  if (db) return db.collection(name);
  return null;
}

async function getMembers() {
  const collection = await getCollection("members");
  if (collection) return collection.find().toArray();
  return inMemory.members;
}

async function addMember(member) {
  const collection = await getCollection("members");
  if (collection) {
    const result = await collection.insertOne(member);
    return result.ops[0];
  }
  inMemory.members.push(member);
  return member;
}

async function deleteMember(id) {
  const collection = await getCollection("members");
  if (collection) {
    return collection.deleteOne({ _id: new ObjectId(id) });
  }
  inMemory.members = inMemory.members.filter((m) => m.id !== id);
}

async function createSession(session) {
  const collection = await getCollection("sessions");
  if (collection) {
    const result = await collection.insertOne(session);
    return result.ops[0];
  }
  inMemory.sessions.push(session);
  return session;
}

async function getActiveSession() {
  const collection = await getCollection("sessions");
  if (collection) {
    return collection.findOne({ active: true });
  }
  return inMemory.sessions.find((s) => s.active);
}

async function addAttendanceRecord(record) {
  const collection = await getCollection("attendance");
  if (collection) {
    const result = await collection.insertOne(record);
    return result.ops[0];
  }
  inMemory.attendance.push(record);
  return record;
}

async function getAttendance(sessionId) {
  const collection = await getCollection("attendance");
  if (collection) {
    return collection.find({ sessionId }).toArray();
  }
  return inMemory.attendance.filter((a) => a.sessionId === sessionId);
}

// ------------- API Routes ----------------

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Serve dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Members
app.get("/api/members", async (req, res) => {
  res.json(await getMembers());
});

app.post("/api/members", async (req, res) => {
  const member = {
    id: uuidv4(),
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
  };
  const saved = await addMember(member);
  res.json(saved);
});

app.delete("/api/members/:id", async (req, res) => {
  await deleteMember(req.params.id);
  res.json({ success: true });
});

// Sessions
app.post("/api/sessions", async (req, res) => {
  // deactivate previous sessions
  const collection = await getCollection("sessions");
  if (collection) {
    await collection.updateMany({}, { $set: { active: false } });
  } else {
    inMemory.sessions.forEach((s) => (s.active = false));
  }

  const session = {
    id: uuidv4(),
    active: true,
    date: new Date(),
  };

  await createSession(session);
  res.json(session);
});

app.get("/api/sessions/active", async (req, res) => {
  const session = await getActiveSession();
  if (!session) return res.json({});

  const qrUrl = `${req.protocol}://${req.get("host")}/scan/${session.id}`;
  const qrCode = await QRCode.toDataURL(qrUrl);

  res.json({
    session,
    qrCode,
    qrUrl,
  });
});

// Scan page
app.get("/scan/:sessionId", (req, res) => {
  res.sendFile(path.join(__dirname, "scan.html"));
});

// Attendance API
app.post("/api/attendance", async (req, res) => {
  const { sessionId, memberId } = req.body;
  const record = {
    id: uuidv4(),
    sessionId,
    memberId,
    timestamp: new Date(),
  };
  await addAttendanceRecord(record);
  res.json(record);
});

app.post("/api/attendance/manual", async (req, res) => {
  const { sessionId, memberId } = req.body;
  const record = {
    id: uuidv4(),
    sessionId,
    memberId,
    timestamp: new Date(),
    method: "manual",
  };
  await addAttendanceRecord(record);
  res.json(record);
});

// Attendance Report
app.get("/api/attendance/report", async (req, res) => {
  const session = await getActiveSession();
  if (!session) {
    return res.json({ message: "No active session" });
  }

  const members = await getMembers();
  const attendance = await getAttendance(session.id);

  const report = members.map((m) => {
    const present = attendance.some((a) => a.memberId === m.id);
    return {
      memberId: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      present,
    };
  });

  res.json({
    session,
    totalMembers: members.length,
    totalPresent: report.filter((r) => r.present).length,
    report,
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
