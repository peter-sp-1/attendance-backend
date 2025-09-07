const os = require('os');

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

function getDashboardHTML() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                  process.env.RAILWAY_STATIC_URL || 
                  `http://${LOCAL_IP}:${PORT}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fellowship Attendance Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header {
            text-align: center; margin-bottom: 40px; background: rgba(255, 255, 255, 0.95);
            padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        .header h1 {
            font-size: 2.5rem; margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .header p { color: #666; font-size: 1.1rem; }
        .status-indicator {
            display: inline-block; padding: 8px 16px; border-radius: 20px;
            font-size: 0.9rem; font-weight: 500; margin-left: 10px;
        }
        .status-connected { background: #e8f5e9; color: #2e7d32; }
        .status-fallback { background: #fff3e0; color: #f57c00; }
        .status-offline { background: #ffebee; color: #c62828; }
        .dashboard-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px; margin-bottom: 30px;
        }
        .card {
            background: rgba(255, 255, 255, 0.95); border-radius: 15px; padding: 25px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2); }
        .card h3 {
            font-size: 1.3rem; margin-bottom: 15px; color: #333;
            display: flex; align-items: center; gap: 10px;
        }
        .icon { font-size: 1.5rem; }
        .btn {
            background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none;
            padding: 12px 24px; border-radius: 25px; cursor: pointer; font-size: 1rem;
            font-weight: 500; transition: all 0.3s ease; text-decoration: none;
            display: inline-block; text-align: center;
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2); }
        .btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
        .btn-secondary { background: linear-gradient(135deg, #4CAF50, #45a049); }
        .btn-danger { background: linear-gradient(135deg, #f44336, #d32f2f); }
        .btn-small { padding: 6px 12px; font-size: 0.9rem; }
        .input-group { margin-bottom: 20px; }
        .input-group label { display: block; margin-bottom: 8px; font-weight: 500; color: #333; }
        .input-group input, .input-group select {
            width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0;
            border-radius: 10px; font-size: 1rem; transition: border-color 0.3s ease;
        }
        .input-group input:focus, .input-group select:focus { border-color: #667eea; outline: none; }
        .qr-container {
            text-align: center; padding: 20px; background: #f8f9fa;
            border-radius: 10px; margin: 20px 0;
        }
        .qr-container img {
            max-width: 250px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        .stats-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px; margin: 20px 0;
        }
        .stat-item {
            text-align: center; padding: 20px;
            background: linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius: 10px;
        }
        .stat-number {
            font-size: 2rem; font-weight: bold; color: #667eea; display: block;
        }
        .stat-label { font-size: 0.9rem; color: #666; margin-top: 5px; }
        .table-container {
            overflow-x: auto; margin-top: 20px; max-height: 400px; overflow-y: auto;
        }
        table {
            width: 100%; border-collapse: collapse; background: white;
            border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
        th {
            background: linear-gradient(135deg, #667eea, #764ba2); color: white;
            font-weight: 500; position: sticky; top: 0; z-index: 10;
        }
        tr:hover { background: #f8f9fa; }
        .message {
            padding: 15px; border-radius: 10px; margin: 15px 0; font-weight: 500;
            position: fixed; top: 20px; right: 20px; z-index: 1000; max-width: 400px;
        }
        .message.success { background: #e8f5e9; color: #2e7d32; border-left: 4px solid #4caf50; }
        .message.error { background: #ffebee; color: #c62828; border-left: 4px solid #f44336; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .loading::after {
            content: ''; display: inline-block; width: 20px; height: 20px;
            border: 2px solid #667eea; border-radius: 50%; border-top-color: transparent;
            animation: spin 1s linear infinite; margin-left: 10px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .modal {
            display: none; position: fixed; z-index: 1000; left: 0; top: 0;
            width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(5px);
        }
        .modal-content {
            background: white; margin: 5% auto; padding: 30px; border-radius: 15px;
            width: 90%; max-width: 500px; position: relative; animation: slideIn 0.3s ease;
            max-height: 80vh; overflow-y: auto;
        }
        @keyframes slideIn { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .close {
            position: absolute; right: 20px; top: 15px; font-size: 2rem;
            cursor: pointer; color: #999;
        }
        .close:hover { color: #333; }
        .empty-state { text-align: center; padding: 60px 20px; color: #999; }
        .empty-state .icon { font-size: 4rem; margin-bottom: 20px; opacity: 0.3; }
        .badge {
            display: inline-block; padding: 4px 8px; border-radius: 12px;
            font-size: 0.8rem; font-weight: 500;
        }
        .badge.first-time { background: #e3f2fd; color: #1976d2; }
        .badge.returning { background: #e8f5e9; color: #2e7d32; }
        .badge.manual { background: #fff3e0; color: #f57c00; }
        .attendance-actions {
            display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .search-input {
            flex: 1; min-width: 250px; padding: 10px; border: 1px solid #ddd; border-radius: 20px;
        }
        @media (max-width: 768px) {
            .header h1 { font-size: 2rem; }
            .dashboard-grid { grid-template-columns: 1fr; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            .container { padding: 10px; }
            .message { position: relative; right: auto; top: auto; max-width: none; }
            .attendance-actions { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fellowship Attendance Dashboard</h1>
            <p>Manage your fellowship attendance with QR codes</p>
            <span id="statusIndicator" class="status-indicator">Checking connection...</span>
        </div>

        <div class="dashboard-grid">
            <div class="card">
                <h3><span class="icon">📊</span> Quick Stats</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-number" id="totalMembers">-</span>
                        <div class="stat-label">Total Members</div>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="presentToday">-</span>
                        <div class="stat-label">Present Today</div>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number" id="firstTimers">-</span>
                        <div class="stat-label">First Timers</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <h3><span class="icon">📅</span> Session Management</h3>
                <div id="activeSessionInfo">
                    <p>No active session</p>
                </div>
                <div style="margin-top: 20px;">
                    <button class="btn" onclick="openNewSessionModal()">
                        <span class="icon">➕</span> Create New Session
                    </button>
                </div>
            </div>

            <div class="card">
                <h3><span class="icon">📱</span> QR Code</h3>
                <div id="qrCodeContainer" class="qr-container">
                    <p class="empty-state">Create a session to generate QR code</p>
                </div>
                <button class="btn btn-secondary" onclick="refreshQRCode()" id="refreshQRBtn" style="display: none;">
                    <span class="icon">🔄</span> Refresh QR Code
                </button>
            </div>
        </div>

        <div class="card">
            <h3><span class="icon">✍️</span> Manual Attendance Marking</h3>
            <p style="color: #666; margin-bottom: 20px;">Mark attendance manually for members who cannot scan QR code</p>
            <div class="attendance-actions">
                <select id="memberSelect" class="search-input" style="min-width: 300px;">
                    <option value="">Select a member to mark present...</option>
                </select>
                <button class="btn" onclick="markManualAttendance()" id="manualMarkBtn">
                    <span class="icon">✅</span> Mark Present
                </button>
            </div>
        </div>

        <div class="card">
            <h3><span class="icon">👥</span> Member Management</h3>
            <div class="attendance-actions">
                <button class="btn btn-secondary" onclick="openAddMemberModal()">
                    <span class="icon">➕</span> Add Member
                </button>
                <button class="btn" onclick="loadMembers()">
                    <span class="icon">🔄</span> Refresh
                </button>
                <input type="text" id="memberSearch" placeholder="🔍 Search members..." 
                       class="search-input" onkeyup="filterMembers()">
            </div>
            <div class="table-container">
                <table id="membersTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="membersTableBody">
                        <tr>
                            <td colspan="5" class="loading">Loading members...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card" id="attendanceCard" style="display: none;">
            <h3><span class="icon">✅</span> Current Session Attendance</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Scan Time</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="attendanceTableBody">
                        <tr>
                            <td colspan="5" class="loading">Loading attendance...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Modals -->
    <div id="newSessionModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('newSessionModal')">&times;</span>
            <h2>Create New Session</h2>
            <form id="newSessionForm">
                <div class="input-group">
                    <label for="sessionName">Session Name:</label>
                    <input type="text" id="sessionName" required placeholder="e.g., Sunday Service - Jan 15, 2024">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="submit" class="btn">Create Session</button>
                    <button type="button" class="btn" onclick="closeModal('newSessionModal')">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <div id="addMemberModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('addMemberModal')">&times;</span>
            <h2>Add New Member</h2>
            <form id="addMemberForm">
                <div class="input-group">
                    <label for="memberName">Full Name:</label>
                    <input type="text" id="memberName" required>
                </div>
                <div class="input-group">
                    <label for="memberEmail">Email Address:</label>
                    <input type="email" id="memberEmail" required>
                </div>
                <div class="input-group">
                    <label for="memberPhone">Phone Number:</label>
                    <input type="tel" id="memberPhone">
                </div>
                <div class="input-group">
                    <label for="memberAddress">Address:</label>
                    <input type="text" id="memberAddress">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="submit" class="btn">Add Member</button>
                    <button type="button" class="btn" onclick="closeModal('addMemberModal')">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const API_BASE = '${baseUrl}';
        let members = [];
        let filteredMembers = [];

        document.addEventListener('DOMContentLoaded', function() {
            initializeDashboard();
            setupFormHandlers();
        });

        function initializeDashboard() {
            checkServerHealth();
            loadMembers();
            loadActiveSession();
            loadCurrentAttendance();
            
            setInterval(() => {
                loadCurrentAttendance();
                updateStats();
            }, 30000);
        }

        function setupFormHandlers() {
            document.getElementById('newSessionForm').addEventListener('submit', createSession);
            document.getElementById('addMemberForm').addEventListener('submit', addMember);
        }

        async function checkServerHealth() {
            try {
                const response = await fetch(API_BASE + '/health');
                const health = await response.json();
                
                const indicator = document.getElementById('statusIndicator');
                if (health.database === 'mongodb') {
                    indicator.textContent = '✅ MongoDB Connected';
                    indicator.className = 'status-indicator status-connected';
                } else if (health.database === 'fallback') {
                    indicator.textContent = '⚠️ Fallback Storage';
                    indicator.className = 'status-indicator status-fallback';
                } else {
                    indicator.textContent = '✅ Server Connected';
                    indicator.className = 'status-indicator status-connected';
                }
            } catch (error) {
                const indicator = document.getElementById('statusIndicator');
                indicator.textContent = '❌ Server Offline';
                indicator.className = 'status-indicator status-offline';
            }
        }

        async function loadMembers() {
            try {
                const response = await fetch(API_BASE + '/api/members');
                if (!response.ok) throw new Error('Failed to fetch members');
                
                members = await response.json();
                filteredMembers = [...members];
                displayMembers();
                populateMemberSelect();
                updateStats();
            } catch (error) {
                console.error('Error loading members:', error);
                showMessage('Failed to load members', 'error');
                document.getElementById('membersTableBody').innerHTML = 
                    '<tr><td colspan="5" class="empty-state">Failed to load members</td></tr>';
            }
        }

        function populateMemberSelect() {
            const select = document.getElementById('memberSelect');
            select.innerHTML = '<option value="">Select a member to mark present...</option>';
            
            members.forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.name + ' (' + member.email + ')';
                select.appendChild(option);
            });
        }

        function displayMembers() {
            const tbody = document.getElementById('membersTableBody');
            
            if (filteredMembers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No members found</td></tr>';
                return;
            }

            tbody.innerHTML = filteredMembers.map(member => 
                '<tr>' +
                '<td>' + member.name + '</td>' +
                '<td>' + member.email + '</td>' +
                '<td>' + (member.phone || 'N/A') + '</td>' +
                '<td>' + new Date(member.created_at).toLocaleDateString() + '</td>' +
                '<td>' +
                '<button class="btn btn-danger btn-small" onclick="deleteMember(\\'' + member.id + '\\')">Delete</button>' +
                '</td>' +
                '</tr>'
            ).join('');
        }

        function filterMembers() {
            const search = document.getElementById('memberSearch').value.toLowerCase();
            filteredMembers = members.filter(member => 
                member.name.toLowerCase().includes(search) ||
                member.email.toLowerCase().includes(search) ||
                (member.phone && member.phone.includes(search))
            );
            displayMembers();
        }

        async function addMember(event) {
            event.preventDefault();
            
            const formData = {
                name: document.getElementById('memberName').value.trim(),
                email: document.getElementById('memberEmail').value.trim(),
                phone: document.getElementById('memberPhone').value.trim(),
                address: document.getElementById('memberAddress').value.trim()
            };

            if (!formData.name || !formData.email) {
                showMessage('Name and email are required', 'error');
                return;
            }

            try {
                const response = await fetch(API_BASE + '/api/members', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Member added successfully!', 'success');
                    closeModal('addMemberModal');
                    document.getElementById('addMemberForm').reset();
                    loadMembers();
                } else {
                    showMessage(result.error || 'Failed to add member', 'error');
                }
            } catch (error) {
                showMessage('Failed to add member. Check your connection.', 'error');
            }
        }

        async function deleteMember(memberId) {
            if (!confirm('Are you sure you want to delete this member?')) return;

            try {
                const response = await fetch(API_BASE + '/api/members/' + memberId, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Member deleted successfully!', 'success');
                    loadMembers();
                } else {
                    showMessage(result.error, 'error');
                }
            } catch (error) {
                showMessage('Failed to delete member', 'error');
            }
        }

        async function markManualAttendance() {
            const memberId = document.getElementById('memberSelect').value;
            if (!memberId) {
                showMessage('Please select a member first', 'error');
                return;
            }

            const btn = document.getElementById('manualMarkBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="icon">⏳</span> Marking...';

            try {
                const response = await fetch(API_BASE + '/api/attendance/manual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ memberId })
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage(result.message, 'success');
                    document.getElementById('memberSelect').value = '';
                    loadCurrentAttendance();
                    updateStats();
                } else {
                    showMessage(result.error || 'Failed to mark attendance', 'error');
                }
            } catch (error) {
                showMessage('Failed to mark attendance. Check your connection.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span class="icon">✅</span> Mark Present';
            }
        }

        async function createSession(event) {
            event.preventDefault();
            
            const sessionName = document.getElementById('sessionName').value.trim();
            if (!sessionName) {
                showMessage('Please enter a session name', 'error');
                return;
            }

            try {
                const response = await fetch(API_BASE + '/api/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionName })
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage('Session created successfully!', 'success');
                    closeModal('newSessionModal');
                    document.getElementById('newSessionForm').reset();
                    loadActiveSession();
                    loadCurrentAttendance();
                } else {
                    showMessage(result.error || 'Failed to create session', 'error');
                }
            } catch (error) {
                showMessage('Failed to create session. Check your connection.', 'error');
            }
        }

        async function loadActiveSession() {
            try {
                const response = await fetch(API_BASE + '/api/sessions/active');
                
                if (response.ok) {
                    const session = await response.json();
                    displayActiveSession(session);
                } else {
                    displayNoActiveSession();
                }
            } catch (error) {
                displayNoActiveSession();
            }
        }

        function displayActiveSession(session) {
            const info = document.getElementById('activeSessionInfo');
            info.innerHTML = 
                '<div style="background: #e8f5e9; padding: 15px; border-radius: 10px; margin-bottom: 10px;">' +
                '<h4 style="color: #2e7d32; margin-bottom: 5px;">' + session.session_name + '</h4>' +
                '<p style="color: #555; margin-bottom: 10px;">' + new Date(session.session_date).toDateString() + '</p>' +
                '<p style="font-size: 0.9rem; color: #666;">QR Code URL: ' + session.qr_data + '</p>' +
                '</div>';

            const qrContainer = document.getElementById('qrCodeContainer');
            qrContainer.innerHTML = 
                '<img src="' + session.qrCodeImage + '" alt="QR Code" style="max-width: 100%; height: auto;">' +
                '<p style="margin-top: 10px; font-size: 0.9rem; color: #666;">Scan this QR code to mark attendance</p>';

            document.getElementById('refreshQRBtn').style.display = 'inline-block';
            document.getElementById('attendanceCard').style.display = 'block';
        }

        function displayNoActiveSession() {
            document.getElementById('activeSessionInfo').innerHTML = '<p>No active session</p>';
            document.getElementById('qrCodeContainer').innerHTML = 
                '<p class="empty-state">Create a session to generate QR code</p>';
            document.getElementById('refreshQRBtn').style.display = 'none';
            document.getElementById('attendanceCard').style.display = 'none';
        }

        async function refreshQRCode() {
            await loadActiveSession();
            showMessage('QR Code refreshed!', 'success');
        }

        async function loadCurrentAttendance() {
            try {
                const response = await fetch(API_BASE + '/api/attendance/current');
                const attendance = await response.json();
                displayCurrentAttendance(attendance);
            } catch (error) {
                console.error('Failed to load current attendance:', error);
            }
        }

        function displayCurrentAttendance(attendance) {
            const tbody = document.getElementById('attendanceTableBody');
            
            if (attendance.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No attendance recorded yet</td></tr>';
                return;
            }

            tbody.innerHTML = attendance.map(record => 
                '<tr>' +
                '<td>' + record.name + '</td>' +
                '<td>' + record.email + '</td>' +
                '<td>' + (record.phone || 'N/A') + '</td>' +
                '<td>' + new Date(record.scan_time).toLocaleString() + '</td>' +
                '<td>' +
                '<span class="badge ' + (record.is_first_time ? 'first-time' : 'returning') + '">' +
                (record.is_first_time ? '🆕 First Timer' : '🔄 Returning') +
                '</span>' +
                (record.marked_manually ? '<span class="badge manual">✍️ Manual</span>' : '') +
                '</td>' +
                '</tr>'
            ).join('');
        }

        async function updateStats() {
            document.getElementById('totalMembers').textContent = members.length;

            try {
                const response = await fetch(API_BASE + '/api/attendance/current');
                const attendance = await response.json();
                
                document.getElementById('presentToday').textContent = attendance.length;
                
                const firstTimers = attendance.filter(record => record.is_first_time).length;
                document.getElementById('firstTimers').textContent = firstTimers;
            } catch (error) {
                document.getElementById('presentToday').textContent = '0';
                document.getElementById('firstTimers').textContent = '0';
            }
        }

        function openNewSessionModal() {
            document.getElementById('newSessionModal').style.display = 'block';
        }

        function openAddMemberModal() {
            document.getElementById('addMemberModal').style.display = 'block';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        window.onclick = function(event) {
            if (event.target.classList.contains('modal')) {
                event.target.style.display = 'none';
            }
        }

        function showMessage(text, type) {
            const existingMessages = document.querySelectorAll('.message');
            existingMessages.forEach(msg => msg.remove());
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            messageDiv.textContent = text;
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.remove();
            }, 5000);
        }
    </script>
</body>
</html>
  `;
}

function getScanPageHTML(session) {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                  process.env.RAILWAY_STATIC_URL || 
                  `http://${LOCAL_IP}:${PORT}`;

  return `
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
          <h2>Fellowship Attendance</h2>
          <p><strong>${session.session_name}</strong></p>
          <p>${new Date(session.session_date).toDateString()}</p>
        </div>

        <div class="tabs">
          <button class="tab active" onclick="switchTab('existing')">Existing Member</button>
          <button class="tab" onclick="switchTab('new')">First Timer</button>
        </div>

        <div id="existing-member" class="tab-content active">
          <input type="text" 
                 class="search-box" 
                 placeholder="Search by name or email..." 
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
              Add & Mark Present
            </button>
          </form>
        </div>

        <div id="message" class="message" style="display: none;"></div>
      </div>

      <script>
        const API_BASE_URL = '${baseUrl}';
        const sessionId = '${session.id}';
        let members = [];
        let markedMembers = new Set();

        window.onload = loadMembers;

        async function loadMembers() {
          try {
            const response = await fetch(API_BASE_URL + '/api/members');
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
            return (
              '<div class="member-card">' +
              '<div class="member-info">' +
              '<div class="member-name">' + member.name + '</div>' +
              '<div class="member-email">' + member.email + '</div>' +
              (member.phone ? '<div class="member-phone">' + member.phone + '</div>' : '') +
              '</div>' +
              '<button onclick="markAttendance(\\'' + member.id + '\\', this)" class="mark-button" ' + 
              (isMarked ? 'disabled' : '') + '>' +
              (isMarked ? 'Marked' : 'Mark Present') + '</button>' +
              '</div>'
            );
          }).join('');
        }

        async function markAttendance(memberId, buttonElement) {
          if (markedMembers.has(memberId)) return;
          
          buttonElement.disabled = true;
          buttonElement.textContent = 'Marking...';
          
          try {
            const response = await fetch(API_BASE_URL + '/api/attendance', {
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
              buttonElement.textContent = 'Marked';
              showMessage(result.message, 'success');
            } else {
              buttonElement.disabled = false;
              buttonElement.textContent = 'Mark Present';
              showMessage(result.error || 'Failed to mark attendance', 'error');
            }
          } catch (error) {
            console.error('Mark attendance error:', error);
            buttonElement.disabled = false;
            buttonElement.textContent = 'Mark Present';
            showMessage('Network error - please try again', 'error');
          }
        }

        async function addNewMember(event) {
          event.preventDefault();
          
          const submitBtn = document.getElementById('submitBtn');
          submitBtn.disabled = true;
          submitBtn.textContent = 'Adding...';
          
          const newMember = {
            name: document.getElementById('newName').value.trim(),
            email: document.getElementById('newEmail').value.trim().toLowerCase(),
            phone: document.getElementById('newPhone').value.trim(),
            address: document.getElementById('newAddress').value.trim()
          };

          // Basic email validation on frontend
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(newMember.email)) {
            showMessage('Please enter a valid email address', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add & Mark Present';
            return;
          }

          console.log('Attempting to add new member:', newMember);

          try {
            const memberResponse = await fetch(API_BASE_URL + '/api/members', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(newMember)
            });

            const memberResult = await memberResponse.json();
            console.log('Member response:', memberResponse.status, memberResult);

            if (memberResponse.ok) {
              console.log('Member added successfully, now marking attendance');
              const attendanceResponse = await fetch(API_BASE_URL + '/api/attendance', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({ sessionId, memberId: memberResult.id })
              });
              
              const attendanceResult = await attendanceResponse.json();
              console.log('Attendance response:', attendanceResponse.status, attendanceResult);
              
              if (attendanceResponse.ok) {
                showMessage('Welcome! You have been registered and marked present.', 'success');
                event.target.reset();
                await loadMembers();
              } else {
                showMessage(attendanceResult.error || 'Member added but failed to mark attendance', 'error');
              }
            } else {
              console.error('Failed to add member:', memberResult);
              showMessage(memberResult.error || 'Failed to register new member', 'error');
            }
          } catch (error) {
            console.error('Add member error:', error);
            showMessage('Network error - please try again', 'error');
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add & Mark Present';
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
      </script>
    </body>
    </html>
  `;
}

module.exports = { getDashboardHTML, getScanPageHTML };