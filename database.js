const { MongoClient } = require('mongodb');

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

// Initialize database collections and indexes
async function initializeDatabase() {
  try {
    const database = await connectToDatabase();
    
    if (database) {
      console.log('🔧 Initializing database collections and indexes...');
      
      const collections = await database.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // Create collections if they don't exist
      if (!collectionNames.includes('members')) {
        await database.createCollection('members');
        console.log('Created members collection');
      }
      if (!collectionNames.includes('attendance_sessions')) {
        await database.createCollection('attendance_sessions');
        console.log('Created attendance_sessions collection');
      }
      if (!collectionNames.includes('attendance_records')) {
        await database.createCollection('attendance_records');
        console.log('Created attendance_records collection');
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
      
      console.log('✅ Database initialization complete');
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

async function checkEmailExists(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const database = await connectToDatabase();
  
  if (database && !fallbackStorage.usingFallback) {
    const existing = await database.collection('members').findOne({ 
      email: normalizedEmail 
    });
    return !!existing;
  } else {
    // Check fallback storage
    for (let member of fallbackStorage.members.values()) {
      if (member.email.toLowerCase() === normalizedEmail) {
        return true;
      }
    }
    return false;
  }
}

async function addMember(memberData) {
  const normalizedEmail = memberData.email.trim().toLowerCase();
  
  console.log(`Adding member: ${memberData.name} with email: ${normalizedEmail}`);
  
  // Check if email already exists
  const emailExists = await checkEmailExists(normalizedEmail);
  if (emailExists) {
    console.log(`Email ${normalizedEmail} already exists`);
    const error = new Error('A member with this email address already exists');
    error.code = 11000;
    throw error;
  }
  
  const database = await connectToDatabase();
  
  // Ensure email is normalized in the member data
  const normalizedMemberData = {
    ...memberData,
    email: normalizedEmail
  };
  
  if (database && !fallbackStorage.usingFallback) {
    try {
      await database.collection('members').insertOne(normalizedMemberData);
      console.log(`Successfully added member: ${normalizedMemberData.name}`);
      return normalizedMemberData;
    } catch (error) {
      console.error('MongoDB insert error:', error);
      if (error.code === 11000) {
        throw new Error('A member with this email address already exists');
      }
      throw error;
    }
  } else {
    fallbackStorage.members.set(normalizedMemberData.id, normalizedMemberData);
    console.log(`Successfully added member to fallback: ${normalizedMemberData.name}`);
    return normalizedMemberData;
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
    // Deactivate all existing sessions
    await database.collection('attendance_sessions').updateMany({}, { $set: { is_active: 0 } });
    // Insert new active session
    await database.collection('attendance_sessions').insertOne(sessionData);
    return sessionData;
  } else {
    // Deactivate all existing sessions in fallback
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
    return await database.collection('attendance_records').findOne({ 
      session_id: sessionId, 
      member_id: memberId 
    });
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
    await database.collection('members').updateOne(
      { id: memberId }, 
      { $set: { first_scan_date: new Date() } }
    );
  } else {
    const member = fallbackStorage.members.get(memberId);
    if (member && !member.first_scan_date) {
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

async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('✅ Database connection closed.');
  }
}

module.exports = {
  connectToDatabase,
  initializeDatabase,
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
  closeDatabase,
  checkEmailExists,
  fallbackStorage
};