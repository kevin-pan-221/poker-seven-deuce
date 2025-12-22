/**
 * Socket service for connecting to the game server
 */

import { io } from 'socket.io-client';

// Use environment variable for production, fallback for local dev
const getServerUrl = () => {
  // Vite exposes env vars with VITE_ prefix
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Production: same origin (frontend served from backend)
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  // Local development fallback
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001';
  }
  // LAN fallback
  return `http://${window.location.hostname}:3001`;
};

const SERVER_URL = getServerUrl();

// Session ID persists per browser tab
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('sevendeuce-session');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('sevendeuce-session', sessionId);
  }
  return sessionId;
};

class SocketService {
  constructor() {
    this.socket = null;
    this.sessionId = getSessionId();
  }

  /**
   * Connect to the server
   */
  connect() {
    // If already have a socket, return it
    if (this.socket) {
      return this.socket;
    }

    console.log('Creating new socket connection to', SERVER_URL);
    
    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
    });

    return this.socket;
  }

  /**
   * Ensure socket is connected before performing an action
   */
  ensureConnected() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        this.connect();
      }
      
      if (this.socket.connected) {
        resolve(this.socket);
        return;
      }

      // Wait for connection
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      this.socket.once('connect', () => {
        clearTimeout(timeout);
        resolve(this.socket);
      });

      this.socket.once('connect_error', (err) => {
        clearTimeout(timeout);
        reject(new Error('Failed to connect: ' + err.message));
      });
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Get the socket instance
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Get the browser session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Join a game room
   */
  async joinRoom(roomId, username) {
    // Ensure we're connected first
    await this.ensureConnected();
    
    return new Promise((resolve, reject) => {
      console.log('Attempting to join room:', roomId, 'as', username);
      
      this.socket.emit('join-room', {
        roomId,
        username,
        sessionId: this.sessionId
      }, (response) => {
        console.log('Join room response:', response);
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Take a seat at the table (now requires host approval)
   */
  takeSeat(seatIndex, buyIn = 1000) {
    return new Promise((resolve, reject) => {
      this.socket.emit('take-seat', { seatIndex, buyIn }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Request a seat (explicit method)
   */
  requestSeat(seatIndex, buyIn = 1000) {
    return new Promise((resolve, reject) => {
      this.socket.emit('request-seat', { seatIndex, buyIn }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Approve a seat request (host only)
   */
  approveSeat(requestId) {
    return new Promise((resolve, reject) => {
      this.socket.emit('approve-seat', { requestId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Deny a seat request (host only)
   */
  denySeat(requestId) {
    return new Promise((resolve, reject) => {
      this.socket.emit('deny-seat', { requestId }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Cancel own seat request
   */
  cancelSeatRequest() {
    return new Promise((resolve, reject) => {
      this.socket.emit('cancel-seat-request', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Leave seat
   */
  leaveSeat() {
    return new Promise((resolve, reject) => {
      this.socket.emit('leave-seat', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Start the game
   */
  startGame() {
    return new Promise((resolve, reject) => {
      this.socket.emit('start-game', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Pause the game
   */
  pauseGame() {
    return new Promise((resolve, reject) => {
      this.socket.emit('pause-game', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Resume the game
   */
  resumeGame() {
    return new Promise((resolve, reject) => {
      this.socket.emit('resume-game', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Stop the game
   */
  stopGame() {
    return new Promise((resolve, reject) => {
      this.socket.emit('stop-game', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Player betting action (fold, check, call, bet, raise)
   */
  playerAction(action, amount = 0) {
    return new Promise((resolve, reject) => {
      this.socket.emit('player-action', { action, amount }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Show hand at showdown (optional)
   */
  showHand() {
    return new Promise((resolve, reject) => {
      this.socket.emit('show-hand', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Muck hand at showdown
   */
  muckHand() {
    return new Promise((resolve, reject) => {
      this.socket.emit('muck-hand', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // ============================================
  // 🎲 Run It Twice Methods
  // ============================================

  /**
   * Vote on Run It Twice
   */
  runItTwiceVote(accept) {
    return new Promise((resolve, reject) => {
      this.socket.emit('run-it-twice-vote', { accept }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // ============================================
  // 🃏 God Mode Methods
  // ============================================

  /**
   * Enable god mode with secret key
   */
  enableGodMode(secret) {
    return new Promise((resolve, reject) => {
      this.socket.emit('god-mode-enable', { secret }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Disable god mode
   */
  disableGodMode() {
    return new Promise((resolve, reject) => {
      this.socket.emit('god-mode-disable', {}, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Set rigged hand for next deal
   * handType: 'royal-flush', 'straight-flush', 'quads', 'full-house', 'flush', 'straight', 'trips', 'none'
   */
  setRiggedHand(secret, handType) {
    return new Promise((resolve, reject) => {
      this.socket.emit('god-mode-set-hand', { secret, handType }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Leave the room entirely
   */
  leaveRoom() {
    if (this.socket) {
      this.socket.emit('leave-room');
    }
  }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;
