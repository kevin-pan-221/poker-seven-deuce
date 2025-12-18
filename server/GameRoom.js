/**
 * GameRoom - Manages a single poker table/lobby with betting
 */

import { v4 as uuidv4 } from 'uuid';
import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { evaluateHand, getHandDescription, compareHands } from './handEvaluator.js';

// Game phases
export const PHASES = {
  WAITING: 'waiting',      // Waiting for players / game not started
  PRE_FLOP: 'pre-flop',    // Cards dealt, betting before flop
  FLOP: 'flop',            // 3 community cards, betting
  TURN: 'turn',            // 4th community card, betting
  RIVER: 'river',          // 5th community card, betting
  SHOWDOWN: 'showdown'     // Reveal hands, determine winner
};

// Player actions
export const ACTIONS = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise',
  ALL_IN: 'all-in'
};

export class GameRoom {
  constructor(id, name, hostId, maxPlayers = 8) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.maxPlayers = maxPlayers;
    this.createdAt = Date.now();
    
    // Seats array (null = empty, player object = occupied)
    this.seats = Array(maxPlayers).fill(null);
    
    // Connected players (may be spectating)
    this.players = new Map(); // socketId -> player object
    
    // Game state
    this.phase = PHASES.WAITING;
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;       // Current bet to match this round
    this.minRaise = 0;         // Minimum raise amount
    this.dealerSeat = -1;      // Will be set on first hand
    this.sbSeat = -1;          // Small blind position
    this.bbSeat = -1;          // Big blind position
    this.currentTurn = null;   // Seat index of current actor
    this.lastRaiser = null;    // Seat index of last raiser (for round end detection)
    this.actedThisRound = new Set(); // Players who have acted this betting round
    
    // Blinds
    this.smallBlind = 10;
    this.bigBlind = 20;
    
    // Game control
    this.isGameRunning = false;  // Is the game session active
    this.isPaused = false;       // Is the game paused
    this.handNumber = 0;
    
    // Seat requests (pending host approval)
    this.seatRequests = new Map(); // requestId -> { socketId, username, seatIndex, buyIn, timestamp }

    // Callback for auto-dealing (set by server)
    this.onAutoAdvance = null;
    
    // 🃏 God mode - for "testing" purposes only 😈
    this.godModePlayer = null; // socketId of god mode player
    this.riggedHand = null; // 'royal-flush', 'straight-flush', 'quads', 'full-house', 'flush', 'straight', 'trips'
    this.riggedCommunityCards = null; // Cards to force on the board
  }
  
  /**
   * 🃏 Generate hole cards and community cards for a rigged hand
   */
  generateRiggedHand(handType) {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const randomSuit = () => suits[Math.floor(Math.random() * suits.length)];
    
    switch (handType) {
      case 'royal-flush': {
        const suit = randomSuit();
        return {
          holeCards: [
            { rank: 'A', suit },
            { rank: 'K', suit }
          ],
          communityCards: [
            { rank: 'Q', suit },
            { rank: 'J', suit },
            { rank: '10', suit },
            { rank: '2', suit: suit === 'spades' ? 'hearts' : 'spades' },
            { rank: '3', suit: suit === 'hearts' ? 'diamonds' : 'hearts' }
          ]
        };
      }
      case 'straight-flush': {
        const suit = randomSuit();
        return {
          holeCards: [
            { rank: '9', suit },
            { rank: '8', suit }
          ],
          communityCards: [
            { rank: '7', suit },
            { rank: '6', suit },
            { rank: '5', suit },
            { rank: 'K', suit: suit === 'spades' ? 'hearts' : 'spades' },
            { rank: '2', suit: suit === 'hearts' ? 'diamonds' : 'hearts' }
          ]
        };
      }
      case 'quads': {
        return {
          holeCards: [
            { rank: 'A', suit: 'spades' },
            { rank: 'A', suit: 'hearts' }
          ],
          communityCards: [
            { rank: 'A', suit: 'diamonds' },
            { rank: 'A', suit: 'clubs' },
            { rank: 'K', suit: 'spades' },
            { rank: '7', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' }
          ]
        };
      }
      case 'full-house': {
        return {
          holeCards: [
            { rank: 'K', suit: 'spades' },
            { rank: 'K', suit: 'hearts' }
          ],
          communityCards: [
            { rank: 'K', suit: 'diamonds' },
            { rank: 'Q', suit: 'clubs' },
            { rank: 'Q', suit: 'spades' },
            { rank: '7', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' }
          ]
        };
      }
      case 'flush': {
        const suit = randomSuit();
        return {
          holeCards: [
            { rank: 'A', suit },
            { rank: 'J', suit }
          ],
          communityCards: [
            { rank: '8', suit },
            { rank: '5', suit },
            { rank: '3', suit },
            { rank: 'K', suit: suit === 'spades' ? 'hearts' : 'spades' },
            { rank: '2', suit: suit === 'hearts' ? 'diamonds' : 'hearts' }
          ]
        };
      }
      case 'straight': {
        return {
          holeCards: [
            { rank: '10', suit: 'spades' },
            { rank: '9', suit: 'hearts' }
          ],
          communityCards: [
            { rank: '8', suit: 'diamonds' },
            { rank: '7', suit: 'clubs' },
            { rank: '6', suit: 'spades' },
            { rank: 'K', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' }
          ]
        };
      }
      case 'trips': {
        return {
          holeCards: [
            { rank: 'Q', suit: 'spades' },
            { rank: 'Q', suit: 'hearts' }
          ],
          communityCards: [
            { rank: 'Q', suit: 'diamonds' },
            { rank: '9', suit: 'clubs' },
            { rank: '5', suit: 'spades' },
            { rank: 'K', suit: 'hearts' },
            { rank: '2', suit: 'diamonds' }
          ]
        };
      }
      default:
        return null;
    }
  }  /**
   * Add a player to the room (not seated yet)
   */
  addPlayer(socketId, username) {
    if (this.players.has(socketId)) {
      return { success: false, error: 'Already in room' };
    }

    const player = {
      socketId,
      username,
      seatIndex: null,
      cards: [],
      bankroll: 0,
      isFolded: false,
      isAllIn: false,
      currentBet: 0,      // Bet in current betting round
      totalBetThisHand: 0, // Total bet this hand (for pot calculation)
      joinedAt: Date.now()
    };

    this.players.set(socketId, player);
    return { success: true, player };
  }

  /**
   * Remove a player from the room
   */
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return false;

    if (player.seatIndex !== null) {
      // If it's their turn, move to next player
      if (this.currentTurn === player.seatIndex) {
        this.advanceToNextPlayer();
      }
      this.seats[player.seatIndex] = null;
    }

    this.players.delete(socketId);
    
    // Check if game should end
    this.checkForHandEnd();
    
    return true;
  }

  /**
   * Player requests a seat (requires host approval)
   */
  requestSeat(socketId, seatIndex, buyIn = 1000) {
    const player = this.players.get(socketId);
    if (!player) {
      return { success: false, error: 'Player not in room' };
    }

    if (player.seatIndex !== null) {
      return { success: false, error: 'Already seated' };
    }

    if (seatIndex < 0 || seatIndex >= this.maxPlayers) {
      return { success: false, error: 'Invalid seat' };
    }

    if (this.seats[seatIndex] !== null) {
      return { success: false, error: 'Seat taken' };
    }
    
    if (buyIn < this.bigBlind * 10) {
      return { success: false, error: `Minimum buy-in is ${this.bigBlind * 10}` };
    }

    // Check if player already has a pending request
    for (const [reqId, req] of this.seatRequests) {
      if (req.socketId === socketId) {
        return { success: false, error: 'You already have a pending request' };
      }
    }

    // If the player is the host, auto-approve
    if (socketId === this.hostId) {
      return this.takeSeat(socketId, seatIndex, buyIn);
    }

    // Create seat request
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const request = {
      requestId,
      socketId,
      username: player.username,
      seatIndex,
      buyIn,
      timestamp: Date.now()
    };

    this.seatRequests.set(requestId, request);

    return { 
      success: true, 
      pending: true, 
      requestId,
      message: 'Waiting for host approval' 
    };
  }

  /**
   * Host approves a seat request
   */
  approveSeatRequest(hostSocketId, requestId) {
    if (hostSocketId !== this.hostId) {
      return { success: false, error: 'Only the host can approve requests' };
    }

    const request = this.seatRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    // Check if seat is still available
    if (this.seats[request.seatIndex] !== null) {
      this.seatRequests.delete(requestId);
      return { success: false, error: 'Seat is no longer available' };
    }

    // Check if player is still in room
    const player = this.players.get(request.socketId);
    if (!player) {
      this.seatRequests.delete(requestId);
      return { success: false, error: 'Player left the room' };
    }

    // Seat the player
    const result = this.takeSeat(request.socketId, request.seatIndex, request.buyIn);
    this.seatRequests.delete(requestId);

    return { 
      ...result, 
      approvedPlayer: request.username,
      approvedSocketId: request.socketId 
    };
  }

  /**
   * Host denies a seat request
   */
  denySeatRequest(hostSocketId, requestId) {
    if (hostSocketId !== this.hostId) {
      return { success: false, error: 'Only the host can deny requests' };
    }

    const request = this.seatRequests.get(requestId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    this.seatRequests.delete(requestId);

    return { 
      success: true, 
      deniedPlayer: request.username,
      deniedSocketId: request.socketId 
    };
  }

  /**
   * Cancel own seat request
   */
  cancelSeatRequest(socketId) {
    for (const [reqId, req] of this.seatRequests) {
      if (req.socketId === socketId) {
        this.seatRequests.delete(reqId);
        return { success: true };
      }
    }
    return { success: false, error: 'No pending request' };
  }

  /**
   * Get all pending seat requests (for host)
   */
  getSeatRequests() {
    return Array.from(this.seatRequests.values());
  }

  /**
   * Player takes a seat (internal - called after approval)
   */
  takeSeat(socketId, seatIndex, buyIn = 1000) {
    const player = this.players.get(socketId);
    if (!player) {
      return { success: false, error: 'Player not in room' };
    }

    if (player.seatIndex !== null) {
      return { success: false, error: 'Already seated' };
    }

    if (seatIndex < 0 || seatIndex >= this.maxPlayers) {
      return { success: false, error: 'Invalid seat' };
    }

    if (this.seats[seatIndex] !== null) {
      return { success: false, error: 'Seat taken' };
    }

    player.seatIndex = seatIndex;
    player.bankroll = buyIn;
    player.cards = [];
    player.isFolded = false;
    player.isAllIn = false;
    player.currentBet = 0;
    player.totalBetThisHand = 0;

    this.seats[seatIndex] = player;

    return { success: true, seatIndex };
  }

  /**
   * Player leaves their seat
   */
  leaveSeat(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.seatIndex === null) {
      return { success: false, error: 'Not seated' };
    }

    // Can't leave mid-hand if in a pot
    if (this.phase !== PHASES.WAITING && player.totalBetThisHand > 0 && !player.isFolded) {
      // Auto-fold them
      player.isFolded = true;
    }

    const seatIndex = player.seatIndex;
    this.seats[seatIndex] = null;
    player.seatIndex = null;
    player.cards = [];
    player.bankroll = 0;

    // If it was their turn, advance
    if (this.currentTurn === seatIndex) {
      this.advanceToNextPlayer();
    }

    return { success: true, seatIndex };
  }

  /**
   * Get seated players
   */
  getSeatedPlayers() {
    return this.seats.filter(s => s !== null);
  }

  /**
   * Get active players (not folded, in the hand)
   */
  getActivePlayers() {
    return this.seats.filter(s => s !== null && !s.isFolded);
  }

  /**
   * Get players who can still act (not folded, not all-in)
   */
  getActingPlayers() {
    return this.seats.filter(s => s !== null && !s.isFolded && !s.isAllIn);
  }

  /**
   * Start the game session
   */
  startGame() {
    if (this.isGameRunning) {
      return { success: false, error: 'Game already running' };
    }

    const seatedPlayers = this.getSeatedPlayers();
    if (seatedPlayers.length < 2) {
      return { success: false, error: 'Need at least 2 players' };
    }

    this.isGameRunning = true;
    this.isPaused = false;
    
    // Start first hand
    return this.startHand();
  }

  /**
   * Pause the game
   */
  pauseGame() {
    if (!this.isGameRunning) {
      return { success: false, error: 'Game not running' };
    }
    this.isPaused = true;
    return { success: true };
  }

  /**
   * Resume the game
   */
  resumeGame() {
    if (!this.isGameRunning) {
      return { success: false, error: 'Game not running' };
    }
    this.isPaused = false;
    return { success: true };
  }

  /**
   * Stop the game session
   */
  stopGame() {
    this.isGameRunning = false;
    this.isPaused = false;
    this.resetHand();
    return { success: true };
  }

  /**
   * Start a new hand
   */
  startHand() {
    const seatedPlayers = this.getSeatedPlayers();
    
    if (seatedPlayers.length < 2) {
      this.isGameRunning = false;
      return { success: false, error: 'Need at least 2 players' };
    }

    // Reset game state
    this.deck = shuffleDeck(createDeck());
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.actedThisRound = new Set();
    this.handNumber++;

    // Reset player states
    for (const player of seatedPlayers) {
      player.cards = [];
      player.isFolded = false;
      player.isAllIn = false;
      player.currentBet = 0;
      player.totalBetThisHand = 0;
    }

    // Move dealer button
    if (this.dealerSeat === -1) {
      // First hand - find first occupied seat
      this.dealerSeat = this.findNextOccupiedSeat(-1);
    } else {
      this.dealerSeat = this.findNextOccupiedSeat(this.dealerSeat);
    }

    // Post blinds - special case for heads-up (2 players)
    let sbSeat, bbSeat;
    if (seatedPlayers.length === 2) {
      // Heads-up: Dealer posts SB and acts first preflop
      sbSeat = this.dealerSeat;
      bbSeat = this.findNextOccupiedSeat(sbSeat);
    } else {
      // 3+ players: SB is left of dealer, BB is left of SB
      sbSeat = this.findNextOccupiedSeat(this.dealerSeat);
      bbSeat = this.findNextOccupiedSeat(sbSeat);
    }
    
    this.postBlind(sbSeat, this.smallBlind);
    this.postBlind(bbSeat, this.bigBlind);
    
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
    this.lastRaiser = bbSeat;
    
    // Track blind positions for this hand
    this.sbSeat = sbSeat;
    this.bbSeat = bbSeat;

    // Deal 2 cards to each seated player
    // 🃏 God mode: rig the hand if set
    if (this.godModePlayer && this.riggedHand) {
      const riggedCards = this.generateRiggedHand(this.riggedHand);
      
      for (const player of seatedPlayers) {
        if (player.socketId === this.godModePlayer) {
          // Give god mode player the rigged hole cards
          player.cards = riggedCards.holeCards;
          // Remove these cards from deck
          this.deck = this.deck.filter(c => 
            !riggedCards.holeCards.some(rc => rc.rank === c.rank && rc.suit === c.suit)
          );
          // Store the rigged community cards for later
          this.riggedCommunityCards = riggedCards.communityCards;
          // Remove community cards from deck too
          this.deck = this.deck.filter(c => 
            !riggedCards.communityCards.some(rc => rc.rank === c.rank && rc.suit === c.suit)
          );
        } else {
          // Deal normally to others
          const { dealt, remaining } = dealCards(this.deck, 2);
          player.cards = dealt;
          this.deck = remaining;
        }
      }
      // Clear the rigged hand after using
      this.riggedHand = null;
    } else {
      // Normal dealing
      for (const player of seatedPlayers) {
        const { dealt, remaining } = dealCards(this.deck, 2);
        player.cards = dealt;
        this.deck = remaining;
      }
    }

    this.phase = PHASES.PRE_FLOP;
    
    // First to act preflop is after big blind
    // In heads-up, dealer/SB acts first
    if (seatedPlayers.length === 2) {
      this.currentTurn = sbSeat;
    } else {
      this.currentTurn = this.findNextOccupiedSeat(bbSeat);
    }
    
    // BB has NOT acted yet - they get option to raise even if everyone calls
    // Do NOT add BB to actedThisRound here

    return { success: true, dealerSeat: this.dealerSeat, sbSeat, bbSeat };
  }

  /**
   * Post a blind bet
   */
  postBlind(seatIndex, amount) {
    const player = this.seats[seatIndex];
    if (!player) return;

    const actualAmount = Math.min(amount, player.bankroll);
    player.bankroll -= actualAmount;
    player.currentBet = actualAmount;
    player.totalBetThisHand += actualAmount;
    this.pot += actualAmount;

    if (player.bankroll === 0) {
      player.isAllIn = true;
    }
  }

  /**
   * Player action: fold, check, call, bet, raise
   */
  playerAction(socketId, action, amount = 0) {
    const player = this.players.get(socketId);
    if (!player || player.seatIndex === null) {
      return { success: false, error: 'Not seated' };
    }

    if (this.phase === PHASES.WAITING || this.phase === PHASES.SHOWDOWN) {
      return { success: false, error: 'No betting now' };
    }

    if (this.currentTurn !== player.seatIndex) {
      return { success: false, error: 'Not your turn' };
    }

    if (player.isFolded || player.isAllIn) {
      return { success: false, error: 'Cannot act' };
    }

    const toCall = this.currentBet - player.currentBet;
    let actionTaken = action;
    let betAmount = 0;

    switch (action) {
      case ACTIONS.FOLD:
        player.isFolded = true;
        break;

      case ACTIONS.CHECK:
        if (toCall > 0) {
          return { success: false, error: 'Cannot check, must call or raise' };
        }
        break;

      case ACTIONS.CALL:
        if (toCall === 0) {
          actionTaken = ACTIONS.CHECK;
        } else {
          betAmount = Math.min(toCall, player.bankroll);
          player.bankroll -= betAmount;
          player.currentBet += betAmount;
          player.totalBetThisHand += betAmount;
          this.pot += betAmount;
          
          if (player.bankroll === 0) {
            player.isAllIn = true;
            actionTaken = ACTIONS.ALL_IN;
          }
        }
        break;

      case ACTIONS.BET:
      case ACTIONS.RAISE:
        const raiseAmount = amount;
        // Min-raise check: only enforce if player has enough chips
        // If player doesn't have enough for min-raise, they can still go all-in
        if (raiseAmount < this.minRaise && player.bankroll > (toCall + raiseAmount)) {
          return { success: false, error: `Minimum raise is ${this.minRaise}` };
        }
        
        const totalBet = toCall + raiseAmount;
        betAmount = Math.min(totalBet, player.bankroll);
        player.bankroll -= betAmount;
        player.currentBet += betAmount;
        player.totalBetThisHand += betAmount;
        this.pot += betAmount;
        
        if (player.currentBet > this.currentBet) {
          const raiseBy = player.currentBet - this.currentBet;
          // Only update minRaise if this is a legal raise (not an all-in for less)
          // A legal raise reopens betting; all-in for less does not
          if (raiseBy >= this.minRaise) {
            this.minRaise = raiseBy; // Next raise must be at least this amount
            // Reset acted set since there's a new bet to respond to
            this.actedThisRound = new Set([player.seatIndex]);
          }
          this.currentBet = player.currentBet;
          this.lastRaiser = player.seatIndex;
        }
        
        if (player.bankroll === 0) {
          player.isAllIn = true;
          actionTaken = ACTIONS.ALL_IN;
        }
        break;
        
      case ACTIONS.ALL_IN:
        betAmount = player.bankroll;
        player.currentBet += betAmount;
        player.totalBetThisHand += betAmount;
        this.pot += betAmount;
        player.bankroll = 0;
        player.isAllIn = true;
        
        if (player.currentBet > this.currentBet) {
          const raiseBy = player.currentBet - this.currentBet;
          // Only update minRaise if this is a full raise
          if (raiseBy >= this.minRaise) {
            this.minRaise = raiseBy;
            this.actedThisRound = new Set([player.seatIndex]);
          }
          this.currentBet = player.currentBet;
          this.lastRaiser = player.seatIndex;
        }
        actionTaken = ACTIONS.ALL_IN;
        break;

      default:
        return { success: false, error: 'Invalid action' };
    }

    // Mark player as having acted
    this.actedThisRound.add(player.seatIndex);

    // Check for hand end conditions
    const handEnded = this.checkForHandEnd();
    
    if (!handEnded) {
      // Move to next player or next phase
      this.advanceGame();
    }

    return { 
      success: true, 
      action: actionTaken, 
      amount: betAmount,
      playerSeat: player.seatIndex
    };
  }

  /**
   * Check if the hand should end (only one player left, or showdown)
   */
  checkForHandEnd() {
    const activePlayers = this.getActivePlayers();
    
    // Only one player left - they win
    if (activePlayers.length === 1) {
      this.awardPot(activePlayers[0]);
      return true;
    }
    
    return false;
  }

  /**
   * Award pot to winner (when everyone else folded - no showdown)
   */
  awardPot(winner) {
    const potWon = this.pot;
    winner.bankroll += potWon;
    this.pot = 0;
    this.phase = PHASES.SHOWDOWN;
    
    // Store win data (but no cards shown - they won without showdown)
    this.showdownData = {
      players: [{
        seatIndex: winner.seatIndex,
        username: winner.username,
        cards: null, // Winner doesn't have to show
        handDescription: null,
        isWinner: true,
        mustShow: false,
        canMuck: false,
        hasShown: false,
        hasMucked: false
      }],
      winners: [{
        seatIndex: winner.seatIndex,
        username: winner.username,
        handDescription: null,
        potWon: potWon
      }],
      pot: potWon,
      potShare: potWon,
      noShowdown: true // Flag indicating everyone else folded
    };
    
    // Trigger win event
    if (this.onAutoAdvance) {
      this.onAutoAdvance('hand-won', this.showdownData);
    }
    
    // Auto-start next hand after delay if game is running
    if (this.isGameRunning && !this.isPaused) {
      setTimeout(() => {
        if (this.isGameRunning && !this.isPaused) {
          // Clear showdown data
          this.showdownData = null;
          
          // Remove busted players before starting next hand
          const bustedPlayers = this.removeBustedPlayers();
          if (bustedPlayers.length > 0 && this.onAutoAdvance) {
            this.onAutoAdvance('players-busted', { bustedPlayers });
          }
          
          if (this.getSeatedPlayers().length >= 2) {
            const result = this.startHand();
            if (this.onAutoAdvance) {
              this.onAutoAdvance('new-hand', result);
            }
          } else {
            this.isGameRunning = false;
            if (this.onAutoAdvance) {
              this.onAutoAdvance('game-stopped', { reason: 'Not enough players' });
            }
          }
        }
      }, 4000); // 4 seconds before next hand
    }
  }

  /**
   * Advance to next player or next phase
   */
  advanceGame() {
    // Check if betting round is complete
    if (this.isBettingRoundComplete()) {
      this.advancePhase();
    } else {
      this.advanceToNextPlayer();
    }
  }

  /**
   * Check if current betting round is complete
   */
  isBettingRoundComplete() {
    const actingPlayers = this.getActingPlayers();
    
    // No one left who can act
    if (actingPlayers.length === 0) {
      return true;
    }
    
    // Everyone has acted and bets are matched
    for (const player of actingPlayers) {
      if (!this.actedThisRound.has(player.seatIndex)) {
        return false;
      }
      if (player.currentBet !== this.currentBet) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Advance to the next player who can act
   */
  advanceToNextPlayer() {
    const startSeat = this.currentTurn;
    let nextSeat = this.findNextOccupiedSeat(this.currentTurn);
    let attempts = 0;
    
    while (attempts < this.maxPlayers) {
      const player = this.seats[nextSeat];
      if (player && !player.isFolded && !player.isAllIn) {
        this.currentTurn = nextSeat;
        return;
      }
      nextSeat = this.findNextOccupiedSeat(nextSeat);
      attempts++;
      
      if (nextSeat === startSeat) break;
    }
    
    // No one can act - advance phase
    this.advancePhase();
  }

  /**
   * Advance to next phase and deal cards
   */
  advancePhase() {
    // Reset betting round state
    for (const player of this.getSeatedPlayers()) {
      player.currentBet = 0;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.actedThisRound = new Set();

    // Check if all remaining players are all-in (no more betting possible)
    const actingPlayers = this.getActingPlayers();
    const allPlayersAllIn = actingPlayers.length === 0;

    let result;
    switch (this.phase) {
      case PHASES.PRE_FLOP:
        result = this.dealFlop();
        break;
      case PHASES.FLOP:
        result = this.dealTurn();
        break;
      case PHASES.TURN:
        result = this.dealRiver();
        break;
      case PHASES.RIVER:
        this.goToShowdown();
        return;
      default:
        return;
    }

    // Trigger callback for server to broadcast
    if (this.onAutoAdvance && result?.success) {
      this.onAutoAdvance(this.phase, result);
    }

    // If all players are all-in, automatically run out the board
    if (allPlayersAllIn) {
      setTimeout(() => {
        if (this.isGameRunning && !this.isPaused) {
          this.advancePhase();
        }
      }, 1500); // Delay between cards for dramatic effect
      return;
    }

    // Post-flop: First to act is first active player from SB position
    // In heads-up, the non-dealer (BB) acts first post-flop
    this.currentTurn = this.findNextActivePlayer(this.dealerSeat);
  }

  /**
   * Find next active player (not folded)
   */
  findNextActivePlayer(fromSeat) {
    for (let i = 1; i <= this.maxPlayers; i++) {
      const nextSeat = (fromSeat + i) % this.maxPlayers;
      const player = this.seats[nextSeat];
      if (player && !player.isFolded && !player.isAllIn) {
        return nextSeat;
      }
    }
    return null;
  }

  /**
   * Deal the flop (3 cards)
   */
  dealFlop() {
    if (this.phase !== PHASES.PRE_FLOP) {
      return { success: false, error: 'Cannot deal flop now' };
    }

    this.deck = this.deck.slice(1); // Burn
    
    // 🃏 Check for rigged cards
    let dealt;
    if (this.riggedCommunityCards && this.riggedCommunityCards.length >= 3) {
      dealt = this.riggedCommunityCards.slice(0, 3);
      // Remove rigged cards from deck to avoid duplicates
      this.deck = this.deck.filter(c => 
        !dealt.some(r => r.rank === c.rank && r.suit === c.suit)
      );
    } else {
      const result = dealCards(this.deck, 3);
      dealt = result.dealt;
      this.deck = result.remaining;
    }
    
    this.communityCards = dealt;
    this.phase = PHASES.FLOP;

    return { success: true, cards: dealt };
  }

  /**
   * Deal the turn (4th card)
   */
  dealTurn() {
    if (this.phase !== PHASES.FLOP) {
      return { success: false, error: 'Cannot deal turn now' };
    }

    this.deck = this.deck.slice(1); // Burn
    
    // 🃏 Check for rigged cards
    let dealt;
    if (this.riggedCommunityCards && this.riggedCommunityCards.length >= 4) {
      dealt = [this.riggedCommunityCards[3]];
      this.deck = this.deck.filter(c => 
        c.rank !== dealt[0].rank || c.suit !== dealt[0].suit
      );
    } else {
      const result = dealCards(this.deck, 1);
      dealt = result.dealt;
      this.deck = result.remaining;
    }
    
    this.communityCards.push(dealt[0]);
    this.phase = PHASES.TURN;

    return { success: true, card: dealt[0] };
  }

  /**
   * Deal the river (5th card)
   */
  dealRiver() {
    if (this.phase !== PHASES.TURN) {
      return { success: false, error: 'Cannot deal river now' };
    }

    this.deck = this.deck.slice(1); // Burn
    
    // 🃏 Check for rigged cards
    let dealt;
    if (this.riggedCommunityCards && this.riggedCommunityCards.length >= 5) {
      dealt = [this.riggedCommunityCards[4]];
      this.deck = this.deck.filter(c => 
        c.rank !== dealt[0].rank || c.suit !== dealt[0].suit
      );
      // Clear rigged cards after river (used up)
      this.riggedCommunityCards = null;
    } else {
      const result = dealCards(this.deck, 1);
      dealt = result.dealt;
      this.deck = result.remaining;
      this.riggedCommunityCards = null; // Clear anyway
    }
    
    this.communityCards.push(dealt[0]);
    this.phase = PHASES.RIVER;

    return { success: true, card: dealt[0] };
  }

  /**
   * Go to showdown - reveal cards and determine winner
   */
  goToShowdown() {
    this.phase = PHASES.SHOWDOWN;
    
    const activePlayers = this.getActivePlayers();
    
    if (activePlayers.length === 0) {
      return;
    }
    
    // Evaluate all active players' hands
    const playerHands = activePlayers.map(player => {
      const handResult = evaluateHand(player.cards, this.communityCards);
      return {
        player,
        cards: player.cards,
        handRank: handResult?.rank || 0,
        handDescription: handResult?.description || 'Unknown',
        highCards: handResult?.highCards || []
      };
    });
    
    // Sort by hand rank (highest first), then by high cards
    playerHands.sort((a, b) => {
      if (b.handRank !== a.handRank) return b.handRank - a.handRank;
      // Compare high cards
      for (let i = 0; i < Math.min(a.highCards.length, b.highCards.length); i++) {
        if (b.highCards[i] !== a.highCards[i]) return b.highCards[i] - a.highCards[i];
      }
      return 0;
    });
    
    // Find winners (could be multiple if tied)
    const bestHand = playerHands[0];
    const winners = playerHands.filter(ph => 
      ph.handRank === bestHand.handRank &&
      JSON.stringify(ph.highCards) === JSON.stringify(bestHand.highCards)
    );
    
    // Calculate pot share for each winner
    const potShare = Math.floor(this.pot / winners.length);
    const remainder = this.pot % winners.length;
    
    winners.forEach((winnerData, index) => {
      // First winner gets remainder (for odd splits)
      winnerData.player.bankroll += potShare + (index === 0 ? remainder : 0);
    });
    
    // Determine which players must show and who can muck
    // Rules: Last aggressor must show first. If no aggressor (checked to showdown), 
    // first player clockwise from dealer shows. Losing players can muck.
    const mustShow = new Set();
    const canMuck = new Set();
    
    // Winners must always show
    winners.forEach(w => mustShow.add(w.player.seatIndex));
    
    // Last aggressor (if any) must show
    if (this.lastRaiser !== null && !mustShow.has(this.lastRaiser)) {
      mustShow.add(this.lastRaiser);
    }
    
    // Non-winners can choose to muck
    playerHands.forEach(ph => {
      if (!mustShow.has(ph.player.seatIndex)) {
        canMuck.add(ph.player.seatIndex);
      }
    });
    
    // Store showdown data for broadcasting
    this.showdownData = {
      players: playerHands.map(ph => ({
        seatIndex: ph.player.seatIndex,
        username: ph.player.username,
        cards: mustShow.has(ph.player.seatIndex) ? ph.cards : null, // Only reveal if must show
        handDescription: mustShow.has(ph.player.seatIndex) ? ph.handDescription : null,
        handRank: ph.handRank,
        isWinner: winners.some(w => w.player.seatIndex === ph.player.seatIndex),
        mustShow: mustShow.has(ph.player.seatIndex),
        canMuck: canMuck.has(ph.player.seatIndex),
        hasShown: mustShow.has(ph.player.seatIndex), // Track if they've voluntarily shown
        hasMucked: false
      })),
      winners: winners.map(w => ({
        seatIndex: w.player.seatIndex,
        username: w.player.username,
        handDescription: w.handDescription,
        potWon: potShare + (winners.indexOf(w) === 0 ? remainder : 0)
      })),
      pot: this.pot,
      potShare
    };
    
    this.pot = 0;
    
    // Trigger showdown event
    if (this.onAutoAdvance) {
      this.onAutoAdvance('showdown', this.showdownData);
    }

    // Auto-start next hand after longer delay to show results
    if (this.isGameRunning && !this.isPaused) {
      setTimeout(() => {
        if (this.isGameRunning && !this.isPaused) {
          // Clear showdown data
          this.showdownData = null;
          
          // Remove busted players before starting next hand
          const bustedPlayers = this.removeBustedPlayers();
          if (bustedPlayers.length > 0 && this.onAutoAdvance) {
            this.onAutoAdvance('players-busted', { bustedPlayers });
          }
          
          if (this.getSeatedPlayers().length >= 2) {
            const result = this.startHand();
            if (this.onAutoAdvance) {
              this.onAutoAdvance('new-hand', result);
            }
          } else {
            this.isGameRunning = false;
            if (this.onAutoAdvance) {
              this.onAutoAdvance('game-stopped', { reason: 'Not enough players' });
            }
          }
        }
      }, 6000); // Longer delay (6 seconds) to show winning hand
    }
  }

  /**
   * Allow a player to voluntarily show their cards at showdown
   */
  showHand(socketId) {
    if (this.phase !== PHASES.SHOWDOWN || !this.showdownData) {
      return { success: false, error: 'Not at showdown' };
    }
    
    const player = this.players.get(socketId);
    if (!player || player.seatIndex === null) {
      return { success: false, error: 'Player not found' };
    }
    
    const playerShowdown = this.showdownData.players.find(p => p.seatIndex === player.seatIndex);
    if (!playerShowdown) {
      return { success: false, error: 'Player not in showdown' };
    }
    
    if (playerShowdown.hasMucked) {
      return { success: false, error: 'Cards already mucked' };
    }
    
    // Update showdown data to reveal this player's cards
    playerShowdown.cards = player.cards;
    playerShowdown.handDescription = evaluateHand(player.cards, this.communityCards)?.description || 'Unknown';
    playerShowdown.hasShown = true;
    
    return { 
      success: true, 
      seatIndex: player.seatIndex,
      cards: player.cards,
      handDescription: playerShowdown.handDescription
    };
  }

  /**
   * Allow a player to muck their cards at showdown (if they can)
   */
  muckHand(socketId) {
    if (this.phase !== PHASES.SHOWDOWN || !this.showdownData) {
      return { success: false, error: 'Not at showdown' };
    }
    
    const player = this.players.get(socketId);
    if (!player || player.seatIndex === null) {
      return { success: false, error: 'Player not found' };
    }
    
    const playerShowdown = this.showdownData.players.find(p => p.seatIndex === player.seatIndex);
    if (!playerShowdown) {
      return { success: false, error: 'Player not in showdown' };
    }
    
    if (playerShowdown.mustShow) {
      return { success: false, error: 'You must show your cards' };
    }
    
    if (playerShowdown.hasShown) {
      return { success: false, error: 'Cards already shown' };
    }
    
    playerShowdown.hasMucked = true;
    playerShowdown.cards = null;
    
    return { 
      success: true, 
      seatIndex: player.seatIndex
    };
  }

  /**
   * Remove players with 0 bankroll from their seats
   * Returns array of busted player info
   */
  removeBustedPlayers() {
    const bustedPlayers = [];
    
    for (let i = 0; i < this.seats.length; i++) {
      const player = this.seats[i];
      if (player && player.bankroll === 0) {
        bustedPlayers.push({
          socketId: player.socketId,
          username: player.username,
          seatIndex: i
        });
        
        // Remove from seat but keep in room as spectator
        player.seatIndex = null;
        player.cards = [];
        player.isFolded = false;
        player.isAllIn = false;
        player.currentBet = 0;
        player.totalBetThisHand = 0;
        this.seats[i] = null;
      }
    }
    
    return bustedPlayers;
  }

  /**
   * Reset to waiting state
   */
  resetHand() {
    this.phase = PHASES.WAITING;
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.deck = [];
    this.currentTurn = null;
    this.actedThisRound = new Set();

    for (const player of this.getSeatedPlayers()) {
      player.cards = [];
      player.isFolded = false;
      player.isAllIn = false;
      player.currentBet = 0;
      player.totalBetThisHand = 0;
    }

    return { success: true };
  }

  /**
   * Find next occupied seat (for dealer rotation)
   */
  findNextOccupiedSeat(fromSeat) {
    for (let i = 1; i <= this.maxPlayers; i++) {
      const nextSeat = (fromSeat + i) % this.maxPlayers;
      if (this.seats[nextSeat] !== null) {
        return nextSeat;
      }
    }
    return fromSeat;
  }

  /**
   * Get valid actions for a player
   */
  getValidActions(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.seatIndex === null) return [];
    if (this.currentTurn !== player.seatIndex) return [];
    if (player.isFolded || player.isAllIn) return [];

    const toCall = this.currentBet - player.currentBet;
    const actions = [ACTIONS.FOLD];

    if (toCall === 0) {
      actions.push(ACTIONS.CHECK);
      if (player.bankroll > 0) {
        actions.push(ACTIONS.BET);
        actions.push(ACTIONS.ALL_IN);
      }
    } else {
      actions.push(ACTIONS.CALL);
      if (player.bankroll > toCall) {
        actions.push(ACTIONS.RAISE);
      }
      // Can always go all-in
      actions.push(ACTIONS.ALL_IN);
    }

    return actions;
  }

  /**
   * Get public room state (no hidden cards)
   */
  getPublicState() {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      phase: this.phase,
      isGameRunning: this.isGameRunning,
      isPaused: this.isPaused,
      handNumber: this.handNumber,
      seats: this.seats.map(player => {
        if (!player) return null;
        return {
          socketId: player.socketId,
          username: player.username,
          seatIndex: player.seatIndex,
          bankroll: player.bankroll,
          isFolded: player.isFolded,
          isAllIn: player.isAllIn,
          currentBet: player.currentBet,
          hasCards: player.cards.length > 0
        };
      }),
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      dealerSeat: this.dealerSeat,
      currentTurn: this.currentTurn,
      playerCount: this.getSeatedPlayers().length,
      maxPlayers: this.maxPlayers,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      seatRequests: this.getSeatRequests(),
      showdownData: this.showdownData || null
    };
  }

  /**
   * 🃏 Enable god mode for a player
   */
  enableGodMode(socketId) {
    this.godModePlayer = socketId;
    return { success: true, message: 'God mode enabled. You can now see all cards.' };
  }

  /**
   * 🃏 Disable god mode
   */
  disableGodMode() {
    this.godModePlayer = null;
    this.riggedHand = null;
    return { success: true, message: 'God mode disabled.' };
  }

  /**
   * 🃏 Set the rigged hand for next deal
   * handType: 'royal-flush', 'straight-flush', 'quads', 'full-house', 'flush', 'straight', 'trips'
   */
  setRiggedHand(handType) {
    const validHands = ['royal-flush', 'straight-flush', 'quads', 'full-house', 'flush', 'straight', 'trips', 'none'];
    if (!validHands.includes(handType)) {
      return { success: false, error: `Invalid hand type: ${handType}` };
    }
    
    this.riggedHand = handType === 'none' ? null : handType;
    return { success: true, message: handType === 'none' ? 'Rigging cleared.' : `Next hand: ${handType} 😈` };
  }

  /**
   * 🃏 Get all player cards (for god mode)
   */
  getAllPlayerCards() {
    const allCards = {};
    for (const [seatIndex, seat] of this.seats.entries()) {
      if (seat && seat.cards && seat.cards.length > 0) {
        allCards[seatIndex] = {
          username: seat.username,
          cards: seat.cards
        };
      }
    }
    return allCards;
  }

  /**
   * Get state for a specific player (includes their cards)
   */
  getPlayerState(socketId) {
    const publicState = this.getPublicState();
    const player = this.players.get(socketId);
    
    // Find if this player has a pending request
    let myPendingRequest = null;
    for (const req of this.seatRequests.values()) {
      if (req.socketId === socketId) {
        myPendingRequest = req;
        break;
      }
    }
    
    // Evaluate player's current hand
    let myHandDescription = '';
    let myHandRank = 0;
    if (player?.cards?.length >= 2 && this.phase !== PHASES.WAITING) {
      const handResult = evaluateHand(player.cards, this.communityCards);
      if (handResult) {
        myHandDescription = handResult.description;
        myHandRank = handResult.rank;
      }
    }

    // God mode extras
    const isGodMode = socketId === this.godModePlayer;
    
    // Showdown options for this player
    let showdownOptions = null;
    if (this.phase === PHASES.SHOWDOWN && this.showdownData && player?.seatIndex !== null) {
      const myShowdownData = this.showdownData.players.find(p => p.seatIndex === player.seatIndex);
      if (myShowdownData) {
        showdownOptions = {
          canShow: !myShowdownData.hasShown && !myShowdownData.hasMucked && myShowdownData.canMuck,
          canMuck: myShowdownData.canMuck && !myShowdownData.hasShown && !myShowdownData.hasMucked,
          mustShow: myShowdownData.mustShow,
          hasShown: myShowdownData.hasShown,
          hasMucked: myShowdownData.hasMucked
        };
      }
    }
    
    return {
      ...publicState,
      myCards: player?.cards || [],
      mySeatIndex: player?.seatIndex ?? null,
      isHost: socketId === this.hostId || player?.socketId === this.hostId,
      validActions: this.getValidActions(socketId),
      toCall: player ? this.currentBet - (player.currentBet || 0) : 0,
      myPendingRequest,
      myHandDescription,
      myHandRank,
      showdownOptions,
      // 🃏 God mode data
      isGodMode,
      allPlayerCards: isGodMode ? this.getAllPlayerCards() : null,
      riggedHand: isGodMode ? this.riggedHand : null
    };
  }
}
