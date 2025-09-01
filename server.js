const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
let db;
let client;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'fellowship_db';

// Fallback storage if MongoDB fails (temporary)
let fallbackStorage = {
  members: new Map(),
  sessions: new Map(),
  attendance: new Map(),
  activeSessionId: null,
  usingFallback: false
};

async function connectToDatabase() {
  if (db) return db;
  
  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(MONGODB_DB);
    
    // Test connection
    await db.admin().ping();
    console.log('✅ Connected to MongoDB successfully');
    return db;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.log('🔄 Falling back to in-memory storage (data will not persist)...');
    fallbackStorage.usingFallback = true;
    return null;
  }
}

// Get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIPAddress();

// Middleware
app.use(cors({
  origin: [
    process.env.RENDER_EXTERNAL_URL,
    `http://${LOCAL_IP}:${PORT}`,
    'http://localhost:5000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Initialize database collections and indexes
async function initializeDatabase() {
  try {
    const database = await connectToDatabase();
    
    if (database) {
      console.log('🔧 Initializing database indexes...');
      
      // Create collections if they don't exist
      const collections = await database.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      if (!collectionNames.includes('members')) {
        await database.createCollection('members');
      }
      if (!collectionNames.includes('attendance_sessions')) {
        await database.createCollection('attendance_sessions');
      }
      if (!collectionNames.includes('attendance_records')) {
        await database.createCollection('attendance_records');
      }
      
      // Create indexes
      try {
        await Promise.all([
          database.collection('members').createIndex({ id: 1 }, { unique: true }),
          database.collection('members').createIndex({ email: 1 }, { unique: true }),
          database.collection('attendance_sessions').createIndex({ id: 1 }, { unique: true }),
          database.collection('attendance_sessions').createIndex({ is_active: 1 }),
          database.collection('attendance_records').createIndex({ session_id: 1, member_id: 1 }, { unique: true })
        ]);
        console.log('✅ Database indexes created successfully');
      } catch (indexError) {
        console.log('⚠️ Some indexes may already exist, continuing...');
      }
      
      // Add some demo data if collections are empty
      const memberCount = await database.collection('members').countDocuments();
      if (memberCount === 0) {
        console.log('📝 Adding demo data...');
        const demoMembers = [
          { 
            id: uuidv4(), 
            name: 'John Doe', 
            email: 'john.doe@example.com', 
            phone: '123-456-7890',
            created_at: new Date()
          },
          { 
            id: uuidv4(), 
            name: 'Jane Smith', 
            email: 'jane.smith@example.com', 
            phone: '098-765-4321',
            created_at: new Date()
          },
          { 
            id: uuidv4(), 
            name: 'Bob Johnson', 
            email: 'bob.johnson@example.com', 
            phone: '555-123-4567',
            created_at: new Date()
          }
        ];
        
        await database.collection('members').insertMany(demoMembers);
        console.log(`✅ Added ${demoMembers.length} demo members`);
      }
      
    } else {
      console.log('⚠️ Using fallback storage - data will not persist after server restart');
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    fallbackStorage.usingFallback = true;
  }
}

// Database helper functions
async function getMembers() {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    return await database.collection('members').find({}).toArray();
  } else {
    return Array.from(fallbackStorage.members.values());
  }
}

async function addMember(memberData) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    // Check for existing email
    const existing = await database.collection('members').findOne({ email: memberData.email });
    if (existing) throw { code: 11000 };
    
    await database.collection('members').insertOne(memberData);
    return memberData;
  } else {
    // Fallback: Check for existing email in memory
    for (let member of fallbackStorage.members.values()) {
      if (member.email === memberData.email) {
        throw { code: 11000 };
      }
    }
    fallbackStorage.members.set(memberData.id, memberData);
    return memberData;
  }
}

async function deleteMember(memberId) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    const result = await database.collection('members').deleteOne({ id: memberId });
    return result.deletedCount;
  } else {
    const deleted = fallbackStorage.members.delete(memberId);
    return deleted ? 1 : 0;
  }
}

async function createSession(sessionData) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    // Deactivate previous sessions
    await database.collection('attendance_sessions').updateMany({}, { $set: { is_active: 0 } });
    await database.collection('attendance_sessions').insertOne(sessionData);
    return sessionData;
  } else {
    // Fallback: Deactivate previous sessions in memory
    for (let session of fallbackStorage.sessions.values()) {
      session.is_active = 0;
    }
    fallbackStorage.sessions.set(sessionData.id, sessionData);
    fallbackStorage.activeSessionId = sessionData.id;
    return sessionData;
  }
}

async function getActiveSession() {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    return await database.collection('attendance_sessions').findOne({ is_active: 1 });
  } else {
    if (fallbackStorage.activeSessionId) {
      const session = fallbackStorage.sessions.get(fallbackStorage.activeSessionId);
      return session && session.is_active === 1 ? session : null;
    }
    return null;
  }
}

async function getSession(sessionId) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    return await database.collection('attendance_sessions').findOne({ id: sessionId, is_active: 1 });
  } else {
    const session = fallbackStorage.sessions.get(sessionId);
    return session && session.is_active === 1 ? session : null;
  }
}

async function getMember(memberId) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    return await database.collection('members').findOne({ id: memberId });
  } else {
    return fallbackStorage.members.get(memberId) || null;
  }
}

async function getAttendanceRecord(sessionId, memberId) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    return await database.collection('attendance_records').findOne({ session_id: sessionId, member_id: memberId });
  } else {
    const key = `${sessionId}-${memberId}`;
    return fallbackStorage.attendance.get(key) || null;
  }
}

async function countMemberAttendance(memberId) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    return await database.collection('attendance_records').countDocuments({ member_id: memberId });
  } else {
    let count = 0;
    for (let record of fallbackStorage.attendance.values()) {
      if (record.member_id === memberId) count++;
    }
    return count;
  }
}

async function updateMemberFirstScan(memberId) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    await database.collection('members').updateOne({ id: memberId }, { $set: { first_scan_date: new Date() } });
  } else {
    const member = fallbackStorage.members.get(memberId);
    if (member) {
      member.first_scan_date = new Date();
    }
  }
}

async function addAttendanceRecord(recordData) {
  const database = await connectToDatabase();
  if (database && !fallbackStorage.usingFallback) {
    await database.collection('attendance_records').insertOne(recordData);
    return recordData;
  } else {
    const key = `${recordData.session_id}-${recordData.member_id}`;
    fallbackStorage.attendance.set(key, recordData);
    return recordData;
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: fallbackStorage.usingFallback ? 'fallback' : 'mongodb',
    mongodb_uri: MONGODB_URI ? 'configured' : 'not configured'
  });
});

// Get all members
app.get('/api/members', async (req, res) => {
  try {
    const members = await getMembers();
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Add new member
app.post('/api/members', async (req, res) => {
  const { name, email, phone, address } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const id = uuidv4();
  
  try {
    const newMember = {
      id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null,
      created_at: new Date()
    };
    
    await addMember(newMember);
    res.json({
      ...newMember,
      message: 'Member added successfully'
    });
  } catch (err) {
    console.error('Error adding member:', err);
    if (err.code === 11000) {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Failed to add member' });
    }
  }
});

// Delete member
app.delete('/api/members/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const deletedCount = await deleteMember(id);
    
    if (deletedCount === 0) {
      res.status(404).json({ error: 'Member not found' });
    } else {
      res.json({ message: 'Member deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// Create new attendance session
app.post('/api/sessions', async (req, res) => {
  const { sessionName } = req.body;
  
  if (!sessionName) {
    return res.status(400).json({ error: 'Session name is required' });
  }
  
  const sessionId = uuidv4();
  const sessionDate = new Date().toISOString().split('T')[0];
  
  try {
    // Create QR data URL - use environment variable for deployed URL or local IP
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                    process.env.RAILWAY_STATIC_URL || 
                    `http://${LOCAL_IP}:${PORT}`;
    const qrData = `${baseUrl}/scan/${sessionId}`;
    
    // Generate QR code
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    const newSession = {
      id: sessionId,
      session_name: sessionName,
      session_date: sessionDate,
      qr_data: qrData,
      is_active: 1,
      created_at: new Date()
    };
    
    await createSession(newSession);
    
    res.json({
      sessionId,
      sessionName,
      sessionDate,
      qrData,
      qrCodeImage: qrCodeDataURL,
      message: 'Session created successfully'
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get active session
app.get('/api/sessions/active', async (req, res) => {
  try {
    const session = await getActiveSession();
    
    if (!session) {
      return res.status(404).json({ error: 'No active session found' });
    }
    
    // Generate fresh QR code
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                    process.env.RAILWAY_STATIC_URL || 
                    `http://${LOCAL_IP}:${PORT}`;
    const qrData = `${baseUrl}/scan/${session.id}`;
    const qrCodeImage = await QRCode.toDataURL(qrData);
    
    res.json({
      id: session.id,
      session_name: session.session_name,
      session_date: session.session_date,
      qrCodeImage,
      qr_data: qrData
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

// Handle QR code scan - serve attendance page
app.get('/scan/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const session = await getSession(sessionId);
    
    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Session Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; background: #f5f5f5; }
            .error { color: #d32f2f; margin-top: 50px; background: white; padding: 20px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Session Not Found</h2>
            <p>This session is either invalid or has expired.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Serve attendance page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Fellowship Attendance</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            min-height: 100vh;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 15px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.2); 
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            padding-bottom: 20px;
            border-bottom: 2px solid #f0f0f0;
          }
          .header h2 {
            color: #333;
            margin-bottom: 10px;
          }
          .search-box {
            width: 100%;
            padding: 15px;
            margin: 15px 0;
            border: 2px solid #e0e0e0;
            border-radius: 25px;
            font-size: 16px;
            box-sizing: border-box;
            transition: border-color 0.3s;
          }
          .search-box:focus {
            border-color: #667eea;
            outline: none;
          }
          .members-list {
            max-height: 400px;
            overflow-y: auto;
            margin: 20px 0;
          }
          .member-card {
            padding: 15px;
            margin: 10px 0;
            border: 1px solid #e0e0e0;
            border-radius: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #fafafa;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .member-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          .member-info {
            flex: 1;
          }
          .member-name {
            font-weight: 600;
            margin-bottom: 5px;
            color: #333;
          }
          .member-email {
            color: #666;
            font-size: 14px;
          }
          .member-phone {
            color: #888;
            font-size: 13px;
          }
          .mark-button {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 500;
            transition: transform 0.2s;
          }
          .mark-button:hover:not(:disabled) { 
            transform: scale(1.05);
          }
          .mark-button:disabled { 
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .tabs {
            display: flex;
            margin-bottom: 20px;
            background: #f5f5f5;
            border-radius: 10px;
            overflow: hidden;
          }
          .tab {
            flex: 1;
            padding: 15px 20px;
            cursor: pointer;
            text-align: center;
            transition: background-color 0.3s;
            border: none;
            background: transparent;
          }
          .tab.active {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
          }
          .tab-content {
            display: none;
          }
          .tab-content.active {
            display: block;
          }
          .new-member-form {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .new-member-form input {
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
          }
          .new-member-form input:focus {
            border-color: #667eea;
            outline: none;
          }
          .submit-button {
            background: linear-gradient(135deg, #2196F3, #1976D2);
            color: white;
            border: none;
            padding: 15px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: transform 0.2s;
          }
          .submit-button:hover:not(:disabled) { 
            transform: translateY(-2px);
          }
          .submit-button:disabled { 
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .message {
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            text-align: center;
            font-weight: 500;
          }
          .success { 
            background: #e8f5e9; 
            color: #2e7d32; 
            border: 1px solid #4caf50;
          }
          .error { 
            background: #ffebee; 
            color: #c62828;
            border: 1px solid #f44336;
          }
          .loading {
            text-align: center;
            color: #666;
            padding: 40px 20px;
          }
          .empty-state {
            text-align: center;
            color: #999;
            padding: 40px 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🏛️ Fellowship Attendance</h2>
            <p><strong>\${session.session_name}</strong></p>
            <p>\${new Date(session.session_date).toDateString()}</p>
          </div>

          <div class="tabs">
            <button class="tab active" onclick="switchTab('existing')">Existing Member</button>
            <button class="tab" onclick="switchTab('new')">First Timer</button>
          </div>

          <div id="existing-member" class="tab-content active">
            <input type="text" 
                   class="search-box" 
                   placeholder="🔍 Search by name or email..." 
                   oninput="filterMembers(this.value)">
            
            <div class="members-list" id="membersList">
              <div class="loading">Loading members...</div>
            </div>
          </div>

          <div id="new-member" class="tab-content">
            <form class="new-member-form" onsubmit="addNewMember(event)">
              <input type="text" id="newName" placeholder="Full Name *" required>
              <input type="email" id="newEmail" placeholder="Email Address *" required>
              <input type="tel" id="newPhone" placeholder="Phone Number">
              <input type="text" id="newAddress" placeholder="Address">
              <button type="submit" class="submit-button" id="submitBtn">
                ➕ Add & Mark Present
              </button>
            </form>
          </div>

          <div id="message" class="message" style="display: none;"></div>
        </div>

        <script>
          const API_BASE_URL = '${process.env.RENDER_EXTERNAL_URL || `http://${LOCAL_IP}:${PORT}`}';
          const sessionId = '${sessionId}';
          let members = [];
          let markedMembers = new Set();

          window.onload = loadMembers;

          async function loadMembers() {
            try {
              const response = await fetch(\`\${API_BASE_URL}/api/members\`);
              if (!response.ok) throw new Error('Failed to fetch');
              
              members = await response.json();
              displayMembers(members);
            } catch (error) {
              console.error('Load members error:', error);
              document.getElementById('membersList').innerHTML = 
                '<div class="error">Failed to load members. Please refresh the page.</div>';
            }
          }

          function filterMembers(searchTerm) {
            const filtered = members.filter(member => 
              member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase()))
            );
            displayMembers(filtered);
          }

          function displayMembers(membersToShow) {
            const list = document.getElementById('membersList');
            
            if (membersToShow.length === 0) {
              list.innerHTML = '<div class="empty-state">No members found</div>';
              return;
            }
            
            list.innerHTML = membersToShow.map(function(member) {
              const isMarked = markedMembers.has(member.id);
              return \\\`
                <div class="member-card">
                  <div class="member-info">
                    <div class="member-name">\\\${member.name}</div>
                    <div class="member-email">\\\${member.email}</div>
                    \\\${member.phone ? \\\`<div class="member-phone">\\\${member.phone}</div>\\\` : ''}
                  </div>
                  <button
                    onclick="markAttendance('\\\${member.id}', this)"
                    class="mark-button"
                    \\\${isMarked ? 'disabled' : ''}
                  >\\\${isMarked ? '✅ Marked' : '📝 Mark Present'}</button>
                </div>
              \\\`;
            }).join('');
          }

          async function markAttendance(memberId, buttonElement) {
            if (markedMembers.has(memberId)) return;
            
            buttonElement.disabled = true;
            buttonElement.textContent = '⏳ Marking...';
            
            try {
              const response = await fetch(\`\${API_BASE_URL}/api/attendance\`, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({ sessionId, memberId })
              });
              
              const result = await response.json();
              
              if (response.ok) {
                markedMembers.add(memberId);
                buttonElement.textContent = '✅ Marked';
                showMessage(result.message, 'success');
              } else {
                buttonElement.disabled = false;
                buttonElement.textContent = '📝 Mark Present';
                showMessage(result.error || 'Failed to mark attendance', 'error');
              }
            } catch (error) {
              console.error('Mark attendance error:', error);
              buttonElement.disabled = false;
              buttonElement.textContent = '📝 Mark Present';
              showMessage('Network error - please try again', 'error');
            }
          }

          async function addNewMember(event) {
            event.preventDefault();
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Adding...';
            
            const newMember = {
              name: document.getElementById('newName').value.trim(),
              email: document.getElementById('newEmail').value.trim(),
              phone: document.getElementById('newPhone').value.trim(),
              address: document.getElementById('newAddress').value.trim()
            };

            try {
              const memberResponse = await fetch(\`\${API_BASE_URL}/api/members\`, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify(newMember)
              });

              const memberResult = await memberResponse.json();

              if (memberResponse.ok) {
                const attendanceResponse = await fetch(\`\${API_BASE_URL}/api/attendance\`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                  },
                  body: JSON.stringify({ sessionId, memberId: memberResult.id })
                });
                
                const attendanceResult = await attendanceResponse.json();
                
                if (attendanceResponse.ok) {
                  showMessage('🎉 Welcome! You have been registered and marked present.', 'success');
                  event.target.reset();
                  await loadMembers();
                } else {
                  showMessage(attendanceResult.error || 'Member added but failed to mark attendance', 'error');
                }
              } else {
                showMessage(memberResult.error || 'Failed to register new member', 'error');
              }
            } catch (error) {
              console.error('Add member error:', error);
              showMessage('Network error - please try again', 'error');
            } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = '➕ Add & Mark Present';
            }
          }

          function switchTab(tab) {
            try {
              document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
              document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
              
              const tabText = tab === 'new' ? 'First Timer' : 'Existing Member';
              const tabElements = document.querySelectorAll('.tab');
              let selectedTab = null;
              tabElements.forEach(t => {
                if (t.textContent.trim() === tabText) {
                  selectedTab = t;
                }
              });
              const selectedContent = document.getElementById(tab + '-member');
              
              if (selectedTab) selectedTab.classList.add('active');
              if (selectedContent) selectedContent.classList.add('active');
            } catch (error) {
              console.error('Switch tab error:', error);
            }
          }

          function showMessage(text, type) {
            const msgDiv = document.getElementById('message');
            msgDiv.textContent = text;
            msgDiv.className = 'message ' + type;
            msgDiv.style.display = 'block';
            
            setTimeout(() => {
              msgDiv.style.display = 'none';
            }, 5000);
          }

          // Initialize the page
          document.addEventListener('DOMContentLoaded', () => {
            loadMembers().catch(console.error);
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error serving attendance page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Mark attendance
app.post('/api/attendance', async (req, res) => {
  const { sessionId, memberId } = req.body;
  
  if (!sessionId || !memberId) {
    return res.status(400).json({ error: 'Session ID and Member ID are required' });
  }
  
  try {
    // Check if session is active
    const activeSession = await getSession(sessionId);
    if (!activeSession) {
      return res.status(400).json({ error: 'Session is not active' });
    }
    
    // Check if member exists
    const member = await getMember(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Check if already marked
    const existingRecord = await getAttendanceRecord(sessionId, memberId);
    if (existingRecord) {
      return res.status(400).json({ error: 'Attendance already marked for this session' });
    }
    
    // Check if first time
    const attendanceCount = await countMemberAttendance(memberId);
    const isFirstTime = attendanceCount === 0;
    
    // If first time, update member record
    if (isFirstTime) {
      await updateMemberFirstScan(memberId);
    }
    
    // Create attendance record
    const attendanceRecord = {
      id: uuidv4(),
      session_id: sessionId,
      member_id: memberId,
      is_first_time: isFirstTime,
      scan_time: new Date(),
      is_present: true
    };
    
    await addAttendanceRecord(attendanceRecord);
    
    const message = isFirstTime 
      ? `🎉 Welcome ${member.name}! First time attendance recorded.`
      : `✅ Attendance marked for ${member.name}!`;
    
    res.json({
      message,
      isFirstTime,
      recordId: attendanceRecord.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Get attendance for active session
app.get('/api/attendance/current', async (req, res) => {
  try {
    const database = await connectToDatabase();
    
    if (database && !fallbackStorage.usingFallback) {
      const activeSession = await database.collection('attendance_sessions').findOne({ is_active: 1 });
      if (!activeSession) return res.json([]);

      const attendance = await database.collection('attendance_records')
        .aggregate([
          { $match: { session_id: activeSession.id } },
          { $lookup: {
            from: 'members',
            localField: 'member_id',
            foreignField: 'id',
            as: 'member'
          }},
          { $unwind: '$member' },
          { $project: {
            id: '$member.id',
            name: '$member.name',
            email: '$member.email',
            phone: '$member.phone',
            is_present: '$is_present',
            scan_time: '$scan_time',
            is_first_time: '$is_first_time'
          }}
        ]).toArray();

      res.json(attendance);
    } else {
      // Fallback logic
      const activeSession = await getActiveSession();
      if (!activeSession) return res.json([]);

      const attendance = [];
      for (let record of fallbackStorage.attendance.values()) {
        if (record.session_id === activeSession.id) {
          const member = fallbackStorage.members.get(record.member_id);
          if (member) {
            attendance.push({
              id: member.id,
              name: member.name,
              email: member.email,
              phone: member.phone,
              is_present: record.is_present,
              scan_time: record.scan_time,
              is_first_time: record.is_first_time
            });
          }
        }
      }
      res.json(attendance);
    }
  } catch (error) {
    console.error('Error fetching current attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get session statistics
app.get('/api/sessions/:sessionId/stats', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const database = await connectToDatabase();
    
    if (database && !fallbackStorage.usingFallback) {
      const stats = await database.collection('attendance_records').aggregate([
        { $match: { session_id: sessionId } },
        { $group: {
          _id: null,
          total_present: { $sum: 1 },
          first_time_count: { $sum: { $cond: [{ $eq: ['$is_first_time', true] }, 1, 0] } }
        }}
      ]).toArray();

      const totalMembers = await database.collection('members').countDocuments({});
      
      const result = stats[0] || { total_present: 0, first_time_count: 0 };
      result.total_members = totalMembers;
      res.json(result);
    } else {
      // Fallback logic
      let totalPresent = 0;
      let firstTimeCount = 0;
      
      for (let record of fallbackStorage.attendance.values()) {
        if (record.session_id === sessionId) {
          totalPresent++;
          if (record.is_first_time) firstTimeCount++;
        }
      }
      
      res.json({
        total_present: totalPresent,
        first_time_count: firstTimeCount,
        total_members: fallbackStorage.members.size
      });
    }
  } catch (error) {
    console.error('Error fetching session stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get all sessions (for history)
app.get('/api/sessions', async (req, res) => {
  try {
    const database = await connectToDatabase();
    
    if (database && !fallbackStorage.usingFallback) {
      const sessions = await database.collection('attendance_sessions')
        .find({})
        .sort({ created_at: -1 })
        .toArray();
      res.json(sessions);
    } else {
      const sessions = Array.from(fallbackStorage.sessions.values())
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.json(sessions);
    }
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get attendance for specific session
app.get('/api/sessions/:sessionId/attendance', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const database = await connectToDatabase();
    
    if (database && !fallbackStorage.usingFallback) {
      const attendance = await database.collection('attendance_records')
        .aggregate([
          { $match: { session_id: sessionId } },
          { $lookup: {
            from: 'members',
            localField: 'member_id',
            foreignField: 'id',
            as: 'member'
          }},
          { $unwind: '$member' },
          { $project: {
            id: '$member.id',
            name: '$member.name',
            email: '$member.email',
            phone: '$member.phone',
            is_present: '$is_present',
            scan_time: '$scan_time',
            is_first_time: '$is_first_time'
          }},
          { $sort: { scan_time: 1 } }
        ]).toArray();

      res.json(attendance);
    } else {
      const attendance = [];
      for (let record of fallbackStorage.attendance.values()) {
        if (record.session_id === sessionId) {
          const member = fallbackStorage.members.get(record.member_id);
          if (member) {
            attendance.push({
              id: member.id,
              name: member.name,
              email: member.email,
              phone: member.phone,
              is_present: record.is_present,
              scan_time: record.scan_time,
              is_first_time: record.is_first_time
            });
          }
        }
      }
      attendance.sort((a, b) => new Date(a.scan_time) - new Date(b.scan_time));
      res.json(attendance);
    }
  } catch (error) {
    console.error('Error fetching session attendance:', error);
    res.status(500).json({ error: 'Failed to fetch session attendance' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Fellowship Attendance Server running on port ${PORT}`);
      console.log(`📱 Local access: http://localhost:${PORT}`);
      console.log(`🌐 Network access: http://${LOCAL_IP}:${PORT}`);
      
      if (fallbackStorage.usingFallback) {
        console.log(`⚠️  Using fallback storage - please check MongoDB connection`);
        console.log(`📋 MongoDB URI: ${MONGODB_URI}`);
      } else {
        console.log(`✅ Connected to MongoDB successfully`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  try {
    if (client) {
      await client.close();
      console.log('✅ Database connection closed.');
    }
  } catch (err) {
    console.error('❌ Error closing database:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  try {
    if (client) {
      await client.close();
    }
  } catch (err) {
    console.error('❌ Error closing database:', err);
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});