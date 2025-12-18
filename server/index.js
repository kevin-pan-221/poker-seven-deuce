/**
 * sevendeuce Server
 * Express + Socket.io backend for multiplayer poker with betting
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom, PHASES, ACTIONS } from './GameRoom.js';

const app = express();
const server = createServer(app);

// Socket.io with CORS for development and LAN access
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.1.39:5173'],
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Store all active game rooms
const rooms = new Map();

// Track which room each socket is in
const socketRooms = new Map();

// Track player sessions by browser session ID
const playerSessions = new Map(); // sessionId -> { socketId, username, roomId }

// ============================================
// REST API Routes
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// List public rooms
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [id, room] of rooms) {
    roomList.push({
      id: room.id,
      name: room.name,
      playerCount: room.getSeatedPlayers().length,
      maxPlayers: room.maxPlayers,
      phase: room.phase,
      isGameRunning: room.isGameRunning
    });
  }
  res.json(roomList);
});

// Create a new room
app.post('/api/rooms', (req, res) => {
  const { name, hostId, maxPlayers = 8 } = req.body;
  
  if (!name || !hostId) {
    return res.status(400).json({ error: 'Name and hostId required' });
  }

  const roomId = uuidv4().slice(0, 8); // Short ID for easy sharing
  const room = new GameRoom(roomId, name, hostId, maxPlayers);
  
  // Set up auto-advance callback for this room
  room.onAutoAdvance = (eventType, data) => {
    broadcastRoomUpdate(roomId, eventType, data);
  };
  
  rooms.set(roomId, room);

  console.log(`Room created: ${roomId} - ${name}`);

  res.json({
    roomId,
    name: room.name,
    inviteLink: `/game/${roomId}`
  });
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.getPublicState());
});

// ============================================
// Helper Functions
// ============================================

/**
 * Broadcast room update to all players
 */
function broadcastRoomUpdate(roomId, eventType, data) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Send public state to room
  io.to(roomId).emit('room-state', room.getPublicState());
  
  // Send private state to each player
  for (const [socketId, player] of room.players) {
    io.to(socketId).emit('player-state', room.getPlayerState(socketId));
  }
  
  // Send game event
  if (eventType) {
    io.to(roomId).emit('game-event', { type: eventType, ...data });
  }
}

// ============================================
// Socket.io Events
// ============================================

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  /**
   * Join a room
   */
  socket.on('join-room', ({ roomId, username, sessionId }, callback) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }

    // Check for duplicate session in same room
    const existingSession = playerSessions.get(sessionId);
    if (existingSession && existingSession.roomId === roomId) {
      return callback({ 
        success: false, 
        error: 'You are already in this game in another tab' 
      });
    }

    // Add player to room
    const result = room.addPlayer(socket.id, username);
    if (!result.success) {
      return callback(result);
    }

    // Check if this player is the original host (by sessionId)
    // and update hostId to their socketId
    if (room.hostId === sessionId || room.originalHostSessionId === sessionId) {
      room.originalHostSessionId = sessionId; // Preserve original
      room.hostId = socket.id;
      console.log(`Host identified: ${username} (${socket.id})`);
    }

    // Track socket -> room mapping
    socketRooms.set(socket.id, roomId);
    
    // Track session
    playerSessions.set(sessionId, {
      socketId: socket.id,
      username,
      roomId
    });
    socket.sessionId = sessionId;

    // Join Socket.io room for broadcasts
    socket.join(roomId);

    console.log(`${username} joined room ${roomId}`);

    // Broadcast updated state to all in room
    io.to(roomId).emit('room-state', room.getPublicState());

    // Send player-specific state to the joiner
    callback({
      success: true,
      state: room.getPlayerState(socket.id)
    });
  });

  /**
   * Request a seat at the table (requires host approval)
   */
  socket.on('request-seat', ({ seatIndex, buyIn = 1000 }, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.requestSeat(socket.id, seatIndex, buyIn);
    
    if (result.success) {
      broadcastRoomUpdate(roomId, result.pending ? 'seat-requested' : 'player-seated');
    }

    callback(result);
  });

  /**
   * Host approves a seat request
   */
  socket.on('approve-seat', ({ requestId }, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.approveSeatRequest(socket.id, requestId);
    
    if (result.success) {
      broadcastRoomUpdate(roomId, 'seat-approved', { 
        username: result.approvedPlayer 
      });
      
      // Send personal notification to approved player
      io.to(result.approvedSocketId).emit('game-event', {
        type: 'your-seat-approved',
        seatIndex: result.seatIndex
      });
    }

    callback(result);
  });

  /**
   * Host denies a seat request
   */
  socket.on('deny-seat', ({ requestId }, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.denySeatRequest(socket.id, requestId);
    
    if (result.success) {
      broadcastRoomUpdate(roomId, 'seat-denied');
      
      // Send personal notification to denied player
      io.to(result.deniedSocketId).emit('game-event', {
        type: 'your-seat-denied'
      });
    }

    callback(result);
  });

  /**
   * Cancel own seat request
   */
  socket.on('cancel-seat-request', (_, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.cancelSeatRequest(socket.id);
    
    if (result.success) {
      broadcastRoomUpdate(roomId);
    }

    callback(result);
  });

  /**
   * Legacy take-seat (for backwards compatibility, redirects to request)
   */
  socket.on('take-seat', ({ seatIndex, buyIn = 1000 }, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.requestSeat(socket.id, seatIndex, buyIn);
    
    if (result.success) {
      broadcastRoomUpdate(roomId, result.pending ? 'seat-requested' : 'player-seated');
    }

    callback(result);
  });

  /**
   * Leave seat (but stay in room)
   */
  socket.on('leave-seat', (_, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.leaveSeat(socket.id);
    
    if (result.success) {
      broadcastRoomUpdate(roomId);
    }

    callback(result);
  });

  /**
   * Start the game (host only)
   */
  socket.on('start-game', (_, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.startGame();
    
    if (result.success) {
      broadcastRoomUpdate(roomId, 'game-started', result);
    }

    callback(result);
  });

  /**
   * Pause the game
   */
  socket.on('pause-game', (_, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.pauseGame();
    
    if (result.success) {
      broadcastRoomUpdate(roomId, 'game-paused');
    }

    callback(result);
  });

  /**
   * Resume the game
   */
  socket.on('resume-game', (_, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.resumeGame();
    
    if (result.success) {
      broadcastRoomUpdate(roomId, 'game-resumed');
    }

    callback(result);
  });

  /**
   * Stop the game
   */
  socket.on('stop-game', (_, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.stopGame();
    
    if (result.success) {
      broadcastRoomUpdate(roomId, 'game-stopped');
    }

    callback(result);
  });

  /**
   * Player betting action
   */
  socket.on('player-action', ({ action, amount = 0 }, callback) => {
    const roomId = socketRooms.get(socket.id);
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Not in a room' });
    }

    const result = room.playerAction(socket.id, action, amount);
    
    if (result.success) {
      const player = room.players.get(socket.id);
      broadcastRoomUpdate(roomId, 'player-action', {
        playerSeat: result.playerSeat,
        username: player?.username,
        action: result.action,
        amount: result.amount
      });
    }

    callback(result);
  });

  /**
   * Leave room entirely
   */
  socket.on('leave-room', () => {
    handleDisconnect(socket);
  });

  /**
   * Handle disconnect
   */
  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });
});

/**
 * Clean up when a socket disconnects
 */
function handleDisconnect(socket) {
  const roomId = socketRooms.get(socket.id);
  const room = rooms.get(roomId);

  if (room) {
    // Check if disconnecting player is the host
    const wasHost = room.hostId === socket.id;
    
    room.removePlayer(socket.id);
    socket.leave(roomId);
    
    console.log(`Socket ${socket.id} left room ${roomId}`);

    // Transfer host if the host left
    if (wasHost && room.players.size > 0) {
      // Get the first remaining player as new host
      const newHostSocketId = room.players.keys().next().value;
      const newHost = room.players.get(newHostSocketId);
      room.hostId = newHostSocketId;
      
      console.log(`Host transferred to ${newHost?.username} (${newHostSocketId})`);
      
      // Notify the new host
      io.to(newHostSocketId).emit('game-event', {
        type: 'you-are-host',
        message: 'You are now the host!'
      });
      
      // Notify all players of host change
      io.to(roomId).emit('game-event', {
        type: 'host-changed',
        newHost: newHost?.username
      });
    }

    // Broadcast updated state
    broadcastRoomUpdate(roomId);

    // Clean up empty rooms after a delay
    if (room.players.size === 0) {
      setTimeout(() => {
        if (room.players.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }, 60000); // 1 minute grace period
    }
  }

  // Clean up session tracking
  if (socket.sessionId) {
    playerSessions.delete(socket.sessionId);
  }
  socketRooms.delete(socket.id);

  console.log(`Socket disconnected: ${socket.id}`);
}

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Listen on all interfaces for LAN access

server.listen(PORT, HOST, () => {
  console.log(`🃏 sevendeuce server running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api`);
  console.log(`   LAN: http://192.168.1.39:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
});
