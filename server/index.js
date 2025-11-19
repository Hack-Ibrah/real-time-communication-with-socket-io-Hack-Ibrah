const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// In-memory stores (for demo / assignment). Replace with DB in production.
const users = {}; // socketId -> { username, userId }
const onlineUsers = {}; // userId -> socketId
const messages = []; // message objects {id, room, from, to, text, timestamp, readBy:[], reactions:{} }

const JWT_SECRET = 'secret_week5_demo'; // replace in prod and .env

app.post('/login', (req, res) => {
  const { username } = req.body;
  if (!username || username.trim().length < 1) return res.status(400).json({ error: 'username required' });
  const userId = uuidv4();
  const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '12h' });
  return res.json({ token, userId, username });
});

// Simple token verify middleware for Socket auth
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const payload = verifyToken(token);
  if (!payload) return next(new Error('unauthorized'));
  socket.user = payload;
  next();
});

io.on('connection', (socket) => {
  const { userId, username } = socket.user;
  users[socket.id] = { userId, username };
  onlineUsers[userId] = socket.id;

  // notify all clients about updated online list
  io.emit('online-users', Object.keys(onlineUsers));

  // join default global room
  socket.join('global');

  // send recent messages (pagination would be implemented with query params)
  const recent = messages.slice(-100);
  socket.emit('load-messages', recent);

  // user joined notification
  socket.broadcast.emit('user-joined', { userId, username });

  socket.on('send-message', (msg, ack) => {
    // msg: { room, to (optional userId), text }
    const message = {
      id: uuidv4(),
      room: msg.room || 'global',
      from: userId,
      fromName: username,
      to: msg.to || null,
      text: msg.text,
      timestamp: Date.now(),
      readBy: msg.to ? [] : [userId], // mark read for sender in public messages
      reactions: {}
    };
    messages.push(message);

    // deliver to room or specific socket
    if (msg.to) {
      // private: emit to sender and recipient
      const targetSocket = onlineUsers[msg.to];
      if (targetSocket) {
        io.to(targetSocket).emit('private-message', message);
      }
      socket.emit('private-message', message);
      // notification
      if (targetSocket) io.to(targetSocket).emit('notification', { type: 'message', from: userId, text: msg.text });
    } else {
      io.to(message.room).emit('new-message', message);
      io.emit('notification', { type: 'message', from: userId, text: msg.text });
    }

    if (ack) ack({ status: 'ok', id: message.id });
  });

  socket.on('typing', (data) => {
    // data: { room, isTyping, to? }
    if (data.to) {
      const targetSocket = onlineUsers[data.to];
      if (targetSocket) io.to(targetSocket).emit('typing', { from: userId, fromName: username, isTyping: data.isTyping });
    } else {
      socket.to(data.room || 'global').emit('typing', { from: userId, fromName: username, isTyping: data.isTyping });
    }
  });

  socket.on('mark-read', ({ messageId }) => {
    const m = messages.find(x => x.id === messageId);
    if (m && !m.readBy.includes(userId)) m.readBy.push(userId);
    io.to(m.room || 'global').emit('message-updated', m);
  });

  socket.on('add-reaction', ({ messageId, reaction }) => {
    const m = messages.find(x => x.id === messageId);
    if (!m) return;
    m.reactions[reaction] = m.reactions[reaction] || [];
    if (!m.reactions[reaction].includes(userId)) m.reactions[reaction].push(userId);
    io.to(m.room || 'global').emit('message-updated', m);
  });

  socket.on('join-room', ({ room }) => {
    socket.join(room);
    socket.emit('joined-room', room);
    socket.to(room).emit('notification', { type: 'info', text: `${username} joined ${room}` });
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
    delete onlineUsers[userId];
    io.emit('online-users', Object.keys(onlineUsers));
    socket.broadcast.emit('user-left', { userId, username });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server listening on', PORT));
