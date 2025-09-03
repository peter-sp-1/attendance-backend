const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initializeDatabase, closeDatabase, getSession } = require('./database');
const routes = require('./routes');
const { getDashboardHTML, getScanPageHTML } = require('./templates');

const app = express();
const PORT = process.env.PORT || 5000;

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
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Serve static files if public directory exists
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// Add preflight handler
app.options('*', cors());

// Use routes
app.use('/', routes);

// Serve the dashboard at root - inline HTML version
app.get('/', (req, res) => {
  // Try to serve from public directory first, if it exists
  const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
  
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    // Serve inline dashboard
    res.send(getDashboardHTML());
  }
});

// Handle QR code scan - serve attendance page for users to mark attendance
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

    res.send(getScanPageHTML(session));
  } catch (error) {
    console.error('Error serving attendance page:', error);
    res.status(500).send('Internal Server Error');
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
      
      const { fallbackStorage } = require('./database');
      if (fallbackStorage.usingFallback) {
        console.log(`⚠️  Using fallback storage - please check MongoDB connection`);
        console.log(`📋 MongoDB URI: ${process.env.MONGODB_URI || 'not configured'}`);
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
    await closeDatabase();
  } catch (err) {
    console.error('❌ Error closing database:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  try {
    await closeDatabase();
  } catch (err) {
    console.error('❌ Error closing database:', err);
  }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});