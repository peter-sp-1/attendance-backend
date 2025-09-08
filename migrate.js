// Create this as migrate.js - Run once to fix the database issue

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'fellowship_db';

async function fixDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    
    console.log('Connected to MongoDB. Starting migration...');
    
    // 1. Get the members collection
    const membersCollection = db.collection('members');
    
    // 2. List all indexes
    console.log('Current indexes:');
    const indexes = await membersCollection.listIndexes().toArray();
    indexes.forEach(index => {
      console.log(`- ${index.name}:`, index.key);
    });
    
    // 3. Drop the problematic memberCode index if it exists
    try {
      await membersCollection.dropIndex('memberCode_1');
      console.log('✅ Dropped memberCode_1 index');
    } catch (error) {
      if (error.code === 27) { // Index not found
        console.log('⚠️ memberCode_1 index not found (already removed)');
      } else {
        throw error;
      }
    }
    
    // 4. Remove memberCode field from all documents
    const updateResult = await membersCollection.updateMany(
      {},
      { $unset: { memberCode: "" } }
    );
    console.log(`✅ Removed memberCode field from ${updateResult.modifiedCount} documents`);
    
    // 5. Recreate proper indexes
    await membersCollection.createIndex({ id: 1 }, { unique: true });
    await membersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('✅ Recreated proper indexes');
    
    // 6. Show final indexes
    console.log('Final indexes:');
    const finalIndexes = await membersCollection.listIndexes().toArray();
    finalIndexes.forEach(index => {
      console.log(`- ${index.name}:`, index.key);
    });
    
    console.log('✅ Database migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

// Run the migration
fixDatabase();