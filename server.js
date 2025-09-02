import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";

const app = express();
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://<user>:<pass>@cluster.mongodb.net/fellowship";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// --- Schemas ---
const MemberSchema = new mongoose.Schema({
  id: String,
  name: String,
});

const SessionSchema = new mongoose.Schema({
  id: String,
  active: Boolean,
});

const AttendanceSchema = new mongoose.Schema({
  sessionId: String,
  memberId: String,
  memberName: String,
  timestamp: Number,
});

const Member = mongoose.model("Member", MemberSchema);
const Session = mongoose.model("Session", SessionSchema);
const Attendance = mongoose.model("Attendance", AttendanceSchema);

// --- Members ---
app.get("/api/members", async (req, res) => {
  const members = await Member.find();
  res.json(members);
});

app.post("/api/members", async (req, res) => {
  const member = new Member({ id: uuidv4(), name: req.body.name });
  await member.save();
  res.json(member);
});

app.delete("/api/members/:id", async (req, res) => {
  await Member.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

// --- Sessions ---
app.post("/api/sessions", async (req, res) => {
  const id = uuidv4();

  // deactivate all old sessions
  await Session.updateMany({}, { active: false });

  const session = new Session({ id, active: true });
  await session.save();

  const url = `https://your-backend.onrender.com/scan/${id}`;
  const qr = await QRCode.toDataURL(url);
  res.json({ id, qr });
});

app.get("/api/sessions/active", async (req, res) => {
  const session = await Session.findOne({ active: true });
  if (!session) return res.status(404).json({ error: "No active session" });
  const url = `https://your-backend.onrender.com/scan/${session.id}`;
  const qr = await QRCode.toDataURL(url);
  res.json({ id: session.id, qr });
});

// --- Scan Page ---
app.get("/scan/:id", async (req, res) => {
  const session = await Session.findOne({ id: req.params.id, active: true });
  if (!session) return res.send("Invalid or expired session");
  res.send(`
    <html>
      <body style="font-family: sans-serif; text-align: center; padding: 2rem;">
        <h2>Fellowship Attendance</h2>
        <p>Enter your name to mark attendance</p>
        <input id="name" placeholder="Your name"/>
        <button onclick="mark()">Submit</button>
        <script>
          async function mark() {
            const name = document.getElementById("name").value.trim();
            if(!name) return alert("Enter name");
            await fetch("/api/attendance", {
              method:"POST",
              headers:{"Content-Type":"application/json"},
              body: JSON.stringify({sessionId:"${session.id}", name})
            });
            alert("Attendance recorded!");
          }
        </script>
      </body>
    </html>
  `);
});

// --- Attendance ---
app.post("/api/attendance", async (req, res) => {
  const { sessionId, name } = req.body;

  let member = await Member.findOne({ name: new RegExp(`^${name}$`, "i") });
  if (!member) {
    member = new Member({ id: uuidv4(), name });
    await member.save();
  }

  const record = new Attendance({
    sessionId,
    memberId: member.id,
    memberName: member.name,
    timestamp: Date.now(),
  });
  await record.save();

  res.json({ success: true });
});

app.post("/api/attendance/manual", async (req, res) => {
  const { memberId } = req.body;
  const session = await Session.findOne({ active: true });
  if (!session) return res.status(400).json({ error: "No active session" });

  const member = await Member.findOne({ id: memberId });
  const record = new Attendance({
    sessionId: session.id,
    memberId: member.id,
    memberName: member.name,
    timestamp: Date.now(),
  });
  await record.save();

  res.json({ success: true });
});

app.get("/api/attendance/report", async (req, res) => {
  const session = await Session.findOne({ active: true });
  if (!session) return res.json([]);
  const records = await Attendance.find({ sessionId: session.id });
  res.json(records);
});

// --- Start Server ---
const port = process.env.PORT || 5000;
app.listen(port, () => console.log("Backend running on port " + port));
