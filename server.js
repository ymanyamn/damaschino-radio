// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// تخزين اتصالات العملاء
const connections = {
    security: [], // قائمة اتصالات الأمن
    management: [], // قائمة اتصالات الإدارة
    users: {} // تخزين معلومات المستخدمين
};

app.use(express.static(path.join(__dirname, 'public')));

// تعريف API للتحقق من الاتصال
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online',
        security: connections.security.length,
        management: connections.management.length,
        total: Object.keys(connections.users).length
    });
});

// معالجة اتصالات Socket
io.on('connection', (socket) => {
    console.log(`مستخدم جديد متصل: ${socket.id}`);
    
    // تسجيل المستخدم
    socket.on('register', (userData) => {
        connections.users[socket.id] = {
            ...userData,
            socketId: socket.id,
            connectedAt: new Date()
        };
        
        // الانضمام للقناة المناسبة
        if (userData.role === 'security') {
            socket.join('security-channel');
            connections.security.push(socket.id);
            console.log(`🔐 مستخدم الأمن ${userData.name} انضم`);
            
            // إعلام بقية الأمن
            socket.to('security-channel').emit('security-update', {
                type: 'user_joined',
                user: userData.name,
                count: connections.security.length
            });
        } 
        else if (userData.role === 'management') {
            socket.join('management-channel');
            connections.management.push(socket.id);
            console.log(`👔 مستخدم الإدارة ${userData.name} انضم`);
        }
        
        // إرسال تأكيد التسجيل
        socket.emit('registered', {
            success: true,
            role: userData.role,
            channels: userData.role === 'user' ? ['security', 'management'] : [userData.role]
        });
    });
    
    // استقبال إشارة WebRTC
    socket.on('signal', (data) => {
        const { to, signal, type } = data;
        
        if (type === 'offer') {
            console.log(`📞 عرض WebRTC من ${socket.id} إلى ${to}`);
            io.to(to).emit('signal', {
                from: socket.id,
                signal: signal,
                type: 'offer'
            });
        } 
        else if (type === 'answer') {
            console.log(`✅ إجابة WebRTC من ${socket.id} إلى ${to}`);
            io.to(to).emit('signal', {
                from: socket.id,
                signal: signal,
                type: 'answer'
            });
        } 
        else if (type === 'ice-candidate') {
            io.to(to).emit('signal', {
                from: socket.id,
                signal: signal,
                type: 'ice-candidate'
            });
        }
    });
    
    // استقبال صوت PTT (Push-to-Talk)
    socket.on('ptt-audio', (data) => {
        const { channel, audioData, userId, userName } = data;
        
        console.log(`🎤 صوت من ${userName} على قناة ${channel}`);
        
        // بث الصوت لكل المشتركين في القناة
        if (channel === 'security') {
            socket.to('security-channel').emit('ptt-audio', {
                audioData: audioData,
                from: userId,
                userName: userName,
                timestamp: new Date().toISOString()
            });
        } 
        else if (channel === 'management') {
            socket.to('management-channel').emit('ptt-audio', {
                audioData: audioData,
                from: userId,
                userName: userName,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // استقبال حالة PTT (بدء/إيقاف الإرسال)
    socket.on('ptt-status', (data) => {
        const { channel, status, userId, userName } = data;
        
        if (channel === 'security') {
            socket.to('security-channel').emit('ptt-status', {
                status: status,
                from: userId,
                userName: userName
            });
        } 
        else if (channel === 'management') {
            socket.to('management-channel').emit('ptt-status', {
                status: status,
                from: userId,
                userName: userName
            });
        }
    });
    
    // استقبال رسائل نصية
    socket.on('message', (data) => {
        const { channel, message, userName } = data;
        
        if (channel === 'security') {
            io.to('security-channel').emit('message', {
                userName: userName,
                message: message,
                timestamp: new Date().toISOString()
            });
        } 
        else if (channel === 'management') {
            io.to('management-channel').emit('message', {
                userName: userName,
                message: message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // فصل المستخدم
    socket.on('disconnect', () => {
        console.log(`مستخدم انقطع: ${socket.id}`);
        
        const user = connections.users[socket.id];
        if (user) {
            // إزالة من القوائم
            if (user.role === 'security') {
                connections.security = connections.security.filter(id => id !== socket.id);
                io.to('security-channel').emit('security-update', {
                    type: 'user_left',
                    user: user.name,
                    count: connections.security.length
                });
            } 
            else if (user.role === 'management') {
                connections.management = connections.management.filter(id => id !== socket.id);
            }
            
            delete connections.users[socket.id];
        }
    });
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
    console.log(`🔐 مستخدمي الأمن المتصلين: ${connections.security.length}`);
    console.log(`👔 مستخدمي الإدارة المتصلين: ${connections.management.length}`);
});
