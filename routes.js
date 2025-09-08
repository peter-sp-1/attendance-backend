const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const os = require('os');
const {
  getMembers,
  addMember,
  deleteMember,
  createSession,
  getActiveSession,
  getSession,
  getMember,
  getAttendanceRecord,
  countMemberAttendance,
  updateMemberFirstScan,
  addAttendanceRecord,
  connectToDatabase,
  checkEmailExists,
  fallbackStorage
} = require('./database');

const router = express.Router();

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
const PORT = process.env.PORT || 5000;

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: fallbackStorage.usingFallback ? 'fallback' : 'mongodb',
    mongodb_uri: process.env.MONGODB_URI ? 'configured' : 'not configured',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all members
router.get('/api/members', async (req, res) => {
  try {
    const members = await getMembers();
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Check if email exists
router.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const exists = await checkEmailExists(email);
    res.json({ exists, email: email.trim().toLowerCase() });
  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({ error: 'Failed to check email' });
  }
});

// Add new member
router.post('/api/members', async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    // Input validation
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Clean and normalize input
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : '';
    const cleanAddress = address ? address.trim() : '';
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    
    console.log(`API: Adding member "${cleanName}" with email "${cleanEmail}"`);
    
    // Check if email already exists
    const emailExists = await checkEmailExists(cleanEmail);
    if (emailExists) {
      console.log(`API: Email ${cleanEmail} already exists`);
      return res.status(409).json({ 
        error: `A member with email "${cleanEmail}" already exists. Please use a different email address.`,
        code: 'EMAIL_EXISTS'
      });
    }
    
    // Create new member object
    const newMember = {
      id: uuidv4(),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      created_at: new Date()
    };
    
    // Add member to database
    const result = await addMember(newMember);
    console.log(`API: Successfully added member: ${result.name}`);
    
    res.status(201).json({
      ...result,
      message: 'Member added successfully'
    });
    
  } catch (error) {
    console.error('Error adding member:', error);
    
    if (error.message.includes('already exists') || error.code === 11000) {
      return res.status(409).json({ 
        error: 'A member with this email address already exists. Please use a different email address.',
        code: 'EMAIL_EXISTS'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to add member. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete member
router.delete('/api/members/:id', async (req, res) => {
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
router.post('/api/sessions', async (req, res) => {
  const { sessionName } = req.body;
  
  if (!sessionName) {
    return res.status(400).json({ error: 'Session name is required' });
  }
  
  const sessionId = uuidv4();
  const sessionDate = new Date().toISOString().split('T')[0];
  
  try {
    // Use Render's external URL if available, otherwise fallback
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `https://${req.get('host')}` || `http://${LOCAL_IP}:${PORT}`;
    const qrData = `${baseUrl}/scan/${sessionId}`;
    
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
router.get('/api/sessions/active', async (req, res) => {
  try {
    const session = await getActiveSession();
    
    if (!session) {
      return res.status(404).json({ error: 'No active session found' });
    }
    
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `https://${req.get('host')}` || `http://${LOCAL_IP}:${PORT}`;
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

// Mark attendance
router.post('/api/attendance', async (req, res) => {
  const { sessionId, memberId } = req.body;
  
  if (!sessionId || !memberId) {
    return res.status(400).json({ error: 'Session ID and Member ID are required' });
  }
  
  try {
    const activeSession = await getSession(sessionId);
    if (!activeSession) {
      return res.status(400).json({ error: 'Session is not active' });
    }
    
    const member = await getMember(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const existingRecord = await getAttendanceRecord(sessionId, memberId);
    if (existingRecord) {
      return res.status(400).json({ error: 'Attendance already marked for this session' });
    }
    
    const attendanceCount = await countMemberAttendance(memberId);
    const isFirstTime = attendanceCount === 0;
    
    if (isFirstTime) {
      await updateMemberFirstScan(memberId);
    }
    
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
      ? `Welcome ${member.name}! First time attendance recorded.`
      : `Attendance marked for ${member.name}!`;
    
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
router.get('/api/attendance/current', async (req, res) => {
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
            is_first_time: '$is_first_time',
            marked_manually: '$marked_manually'
          }},
          { $sort: { scan_time: -1 } }
        ]).toArray();

      res.json(attendance);
    } else {
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
              is_first_time: record.is_first_time,
              marked_manually: record.marked_manually || false
            });
          }
        }
      }
      // Sort by scan time descending
      attendance.sort((a, b) => new Date(b.scan_time) - new Date(a.scan_time));
      res.json(attendance);
    }
  } catch (error) {
    console.error('Error fetching current attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Manual attendance marking for dashboard
router.post('/api/attendance/manual', async (req, res) => {
  const { memberId } = req.body;
  
  if (!memberId) {
    return res.status(400).json({ error: 'Member ID is required' });
  }
  
  try {
    const activeSession = await getActiveSession();
    if (!activeSession) {
      return res.status(400).json({ error: 'No active session found' });
    }
    
    const member = await getMember(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const existingRecord = await getAttendanceRecord(activeSession.id, memberId);
    if (existingRecord) {
      return res.status(400).json({ error: 'Attendance already marked for this session' });
    }
    
    const attendanceCount = await countMemberAttendance(memberId);
    const isFirstTime = attendanceCount === 0;
    
    if (isFirstTime) {
      await updateMemberFirstScan(memberId);
    }
    
    const attendanceRecord = {
      id: uuidv4(),
      session_id: activeSession.id,
      member_id: memberId,
      is_first_time: isFirstTime,
      scan_time: new Date(),
      is_present: true,
      marked_manually: true
    };
    
    await addAttendanceRecord(attendanceRecord);
    
    res.json({
      message: `${member.name} marked present manually!`,
      isFirstTime,
      recordId: attendanceRecord.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error marking manual attendance:', error);
    res.status(500).json({ error: 'Failed to mark attendance manually' });
  }
});

// Get session statistics
router.get('/api/sessions/:sessionId/stats', async (req, res) => {
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
router.get('/api/sessions', async (req, res) => {
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

// Add this route to your routes.js file temporarily to fix the database issue
// After running once, you can remove this route

router.post('/api/fix-database', async (req, res) => {
  try {
    const database = await connectToDatabase();
    
    if (!database) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    console.log('Starting database fix...');
    
    // 1. Get the members collection
    const membersCollection = database.collection('members');
    
    // 2. List all indexes to see what we're dealing with
    const indexes = await membersCollection.listIndexes().toArray();
    console.log('Current indexes:');
    indexes.forEach(index => {
      console.log(`- ${index.name}:`, index.key);
    });
    
    // 3. Check if memberCode_1 index exists and drop it
    const memberCodeIndex = indexes.find(index => index.name === 'memberCode_1');
    if (memberCodeIndex) {
      await membersCollection.dropIndex('memberCode_1');
      console.log('Dropped memberCode_1 index');
    }
    
    // 4. Remove memberCode field from all existing documents
    const updateResult = await membersCollection.updateMany(
      {},
      { $unset: { memberCode: "" } }
    );
    console.log(`Removed memberCode field from ${updateResult.modifiedCount} documents`);
    
    // 5. Ensure proper indexes exist
    try {
      await membersCollection.createIndex({ id: 1 }, { unique: true });
      console.log('Created/verified id index');
    } catch (e) {
      console.log('id index already exists');
    }
    
    try {
      await membersCollection.createIndex({ email: 1 }, { unique: true });
      console.log('Created/verified email index');
    } catch (e) {
      console.log('email index already exists');
    }
    
    // 6. Show final state
    const finalIndexes = await membersCollection.listIndexes().toArray();
    console.log('Final indexes:');
    finalIndexes.forEach(index => {
      console.log(`- ${index.name}:`, index.key);
    });
    
    res.json({ 
      message: 'Database fixed successfully!', 
      documentsUpdated: updateResult.modifiedCount,
      indexesRemoved: memberCodeIndex ? 1 : 0
    });
    
  } catch (error) {
    console.error('Error fixing database:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;