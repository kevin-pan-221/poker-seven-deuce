/**
 * GameRoom - Manages a single poker table/lobby with betting
 */

import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { evaluateHand } from './handEvaluator.js';

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
    
    // Side pots for all-in situations
    this.sidePots = [];                  // Array of { amount, eligibleSeats[] }
    
    // Run It Twice state
    this.runItTwiceOffered = false;      // Is RIT currently being offered?
    this.runItTwiceAccepted = false;     // Was RIT accepted for this hand?
    this.runItTwiceVotes = new Map();    // socketId -> boolean (accept/decline)
    this.runItTwiceEligiblePlayers = []; // Players who can vote on RIT
    this.secondBoard = [];               // Second board for RIT
    this.ritResults = null;              // Results from both boards
    
    // 🃏 God mode - for "testing" purposes only 😈
    this.godModePlayer = null; // socketId of god mode player
    this.riggedHand = null; // 'royal-flush', 'straight-flush', 'quads', 'full-house', 'flush', 'straight', 'trips'
    this.riggedCommunityCards = null; // Cards to force on the board
  }
  
  /**
   * 🃏 Generate hole cards and community cards for a rigged hand
   * Now with variety and opponent hands that look strong but lose!
   */
  generateRiggedHand(handType, numOpponents = 1) {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    const randomSuit = () => suits[Math.floor(Math.random() * suits.length)];
    const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const shuffleArray = (arr) => {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };
    const getOtherSuits = (excludeSuit) => suits.filter(s => s !== excludeSuit);
    const getRandomOtherSuit = (excludeSuit) => randomElement(getOtherSuits(excludeSuit));
    
    // Helper to get consecutive ranks for straights
    const getConsecutiveRanks = (highRank, count = 5) => {
      const idx = ranks.indexOf(highRank);
      if (idx < count - 1) return null;
      return ranks.slice(idx - count + 1, idx + 1).reverse();
    };
    
    switch (handType) {
      case 'royal-flush': {
        // Randomly choose which cards god gets vs board
        const suit = randomSuit();
        const royalRanks = ['A', 'K', 'Q', 'J', '10'];
        const shuffledRoyal = shuffleArray(royalRanks);
        
        // God gets 2 random royal cards, board gets other 3
        const godRanks = shuffledRoyal.slice(0, 2);
        const boardRoyal = shuffledRoyal.slice(2, 5);
        
        const usedCards = [];
        const holeCards = godRanks.map(r => ({ rank: r, suit }));
        usedCards.push(...holeCards);
        
        const communityCards = boardRoyal.map(r => ({ rank: r, suit }));
        usedCards.push(...communityCards);
        
        // Add 2 filler cards to board (different suits to avoid giving opponents flush)
        const otherSuits = getOtherSuits(suit);
        communityCards.push({ rank: randomElement(['2', '3', '4', '5', '6']), suit: otherSuits[0] });
        communityCards.push({ rank: randomElement(['7', '8', '9']), suit: otherSuits[1] });
        usedCards.push(...communityCards.slice(3));
        
        // Generate opponent hands - give them lower straight flushes or flushes
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          const oppSuit = getRandomOtherSuit(suit);
          // Give opponent a flush (strong but loses to royal)
          const flushRanks = shuffleArray(['A', 'K', 'Q', 'J', '9', '8', '7'].filter(r => 
            !usedCards.some(c => c.rank === r && c.suit === oppSuit)
          ));
          if (flushRanks.length >= 2) {
            const oppHand = [
              { rank: flushRanks[0], suit: oppSuit },
              { rank: flushRanks[1], suit: oppSuit }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      case 'straight-flush': {
        const suit = randomSuit();
        // Random high card between 9 and K for straight flush (not royal)
        const highOptions = ['9', '10', 'J', 'Q', 'K'];
        const highRank = randomElement(highOptions);
        const sfRanks = getConsecutiveRanks(highRank, 5);
        
        const shuffledSF = shuffleArray(sfRanks);
        const godRanks = shuffledSF.slice(0, 2);
        const boardSF = shuffledSF.slice(2, 5);
        
        const usedCards = [];
        const holeCards = godRanks.map(r => ({ rank: r, suit }));
        usedCards.push(...holeCards);
        
        const communityCards = boardSF.map(r => ({ rank: r, suit }));
        usedCards.push(...communityCards);
        
        // Filler cards
        const otherSuits = getOtherSuits(suit);
        communityCards.push({ rank: randomElement(['2', '3']), suit: otherSuits[0] });
        communityCards.push({ rank: 'A', suit: otherSuits[1] }); // Tease with an ace
        usedCards.push(...communityCards.slice(3));
        
        // Opponent gets quads or full house (loses to straight flush)
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          const quadRank = randomElement(['A', 'K', 'Q', 'J'].filter(r => 
            !usedCards.some(c => c.rank === r)
          ));
          if (quadRank) {
            const availableSuits = suits.filter(s => !usedCards.some(c => c.rank === quadRank && c.suit === s));
            if (availableSuits.length >= 2) {
              const oppHand = [
                { rank: quadRank, suit: availableSuits[0] },
                { rank: quadRank, suit: availableSuits[1] }
              ];
              opponentHands.push(oppHand);
              usedCards.push(...oppHand);
            }
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      case 'quads': {
        // Random rank for quads (face cards or aces)
        const quadRanks = ['A', 'K', 'Q', 'J', '10', '9'];
        const quadRank = randomElement(quadRanks);
        const shuffledSuits = shuffleArray(suits);
        
        const usedCards = [];
        // God gets 2 of the quads
        const holeCards = [
          { rank: quadRank, suit: shuffledSuits[0] },
          { rank: quadRank, suit: shuffledSuits[1] }
        ];
        usedCards.push(...holeCards);
        
        // Board has other 2 of the quads
        const communityCards = [
          { rank: quadRank, suit: shuffledSuits[2] },
          { rank: quadRank, suit: shuffledSuits[3] }
        ];
        
        // Add kicker and fillers - make it look like full house is possible
        const kickerRank = randomElement(['A', 'K', 'Q'].filter(r => r !== quadRank));
        communityCards.push({ rank: kickerRank, suit: randomSuit() });
        communityCards.push({ rank: kickerRank, suit: getRandomOtherSuit(communityCards[2].suit) });
        communityCards.push({ rank: randomElement(['7', '8', '9'].filter(r => r !== quadRank)), suit: randomSuit() });
        usedCards.push(...communityCards);
        
        // Opponent gets full house (loses to quads)
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          const oppTripsRank = kickerRank; // They'll have trips of the kicker
          const availableSuits = suits.filter(s => !usedCards.some(c => c.rank === oppTripsRank && c.suit === s));
          if (availableSuits.length >= 2) {
            const oppHand = [
              { rank: oppTripsRank, suit: availableSuits[0] },
              { rank: oppTripsRank, suit: availableSuits[1] }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      case 'full-house': {
        // Random ranks for trips and pair
        const tripsRanks = ['A', 'K', 'Q', 'J', '10'];
        const tripsRank = randomElement(tripsRanks);
        const pairRanks = tripsRanks.filter(r => r !== tripsRank);
        const pairRank = randomElement(pairRanks);
        
        const usedCards = [];
        const tripsSuits = shuffleArray(suits);
        
        // God gets pocket pair of trips rank
        const holeCards = [
          { rank: tripsRank, suit: tripsSuits[0] },
          { rank: tripsRank, suit: tripsSuits[1] }
        ];
        usedCards.push(...holeCards);
        
        // Board has third trips card and the pair
        const pairSuits = shuffleArray(suits);
        const communityCards = [
          { rank: tripsRank, suit: tripsSuits[2] },
          { rank: pairRank, suit: pairSuits[0] },
          { rank: pairRank, suit: pairSuits[1] }
        ];
        
        // Filler cards
        const fillerRanks = ['2', '3', '4', '5', '6', '7'].filter(r => r !== tripsRank && r !== pairRank);
        communityCards.push({ rank: randomElement(fillerRanks), suit: randomSuit() });
        communityCards.push({ rank: randomElement(fillerRanks.filter(r => r !== communityCards[3].rank)), suit: randomSuit() });
        usedCards.push(...communityCards);
        
        // Opponent gets smaller full house or flush
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          // Give them the pair rank for trips (smaller full house)
          const availableSuits = suits.filter(s => !usedCards.some(c => c.rank === pairRank && c.suit === s));
          if (availableSuits.length >= 2) {
            const oppHand = [
              { rank: pairRank, suit: availableSuits[0] },
              { rank: pairRank, suit: availableSuits[1] }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      case 'flush': {
        const suit = randomSuit();
        // Random flush cards (not straight flush)
        const flushRanks = shuffleArray(['A', 'K', 'J', '9', '7', '5', '3']);
        const godFlush = flushRanks.slice(0, 2);
        const boardFlush = flushRanks.slice(2, 5);
        
        const usedCards = [];
        const holeCards = godFlush.map(r => ({ rank: r, suit }));
        usedCards.push(...holeCards);
        
        const communityCards = boardFlush.map(r => ({ rank: r, suit }));
        
        // Add non-flush cards to board
        const otherSuits = getOtherSuits(suit);
        communityCards.push({ rank: randomElement(['Q', '10', '8']), suit: otherSuits[0] });
        communityCards.push({ rank: randomElement(['6', '4', '2']), suit: otherSuits[1] });
        usedCards.push(...communityCards);
        
        // Opponent gets straight or lower flush
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          // Give them lower flush cards
          const oppFlushRanks = flushRanks.slice(5).filter(r => !usedCards.some(c => c.rank === r && c.suit === suit));
          if (oppFlushRanks.length >= 2) {
            const oppHand = [
              { rank: oppFlushRanks[0], suit },
              { rank: oppFlushRanks[1] || randomElement(['2', '4', '6']), suit }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          } else {
            // Give them a straight instead
            const oppHand = [
              { rank: '10', suit: otherSuits[0] },
              { rank: '9', suit: otherSuits[1] }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      case 'straight': {
        // Random straight (not wheel, not broadway)
        const highOptions = ['9', '10', 'J', 'Q', 'K'];
        const highRank = randomElement(highOptions);
        const straightRanks = getConsecutiveRanks(highRank, 5);
        
        // Mix up suits so it's not a straight flush
        const shuffledStraight = shuffleArray(straightRanks);
        const godRanks = shuffledStraight.slice(0, 2);
        const boardStraight = shuffledStraight.slice(2, 5);
        
        const usedCards = [];
        const assignedSuits = shuffleArray(suits);
        
        const holeCards = [
          { rank: godRanks[0], suit: assignedSuits[0] },
          { rank: godRanks[1], suit: assignedSuits[1] }
        ];
        usedCards.push(...holeCards);
        
        const communityCards = boardStraight.map((r, i) => ({ 
          rank: r, 
          suit: assignedSuits[(i + 2) % 4] 
        }));
        
        // Filler cards
        communityCards.push({ rank: 'A', suit: randomSuit() });
        communityCards.push({ rank: '2', suit: randomSuit() });
        usedCards.push(...communityCards);
        
        // Opponent gets trips or two pair
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          const tripRank = randomElement(['A', 'K', 'Q'].filter(r => !straightRanks.includes(r)));
          const availableSuits = suits.filter(s => !usedCards.some(c => c.rank === tripRank && c.suit === s));
          if (availableSuits.length >= 2) {
            const oppHand = [
              { rank: tripRank, suit: availableSuits[0] },
              { rank: tripRank, suit: availableSuits[1] }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      case 'trips': {
        const tripsRanks = ['A', 'K', 'Q', 'J', '10'];
        const tripsRank = randomElement(tripsRanks);
        const tripsSuits = shuffleArray(suits);
        
        const usedCards = [];
        
        // God gets pocket pair
        const holeCards = [
          { rank: tripsRank, suit: tripsSuits[0] },
          { rank: tripsRank, suit: tripsSuits[1] }
        ];
        usedCards.push(...holeCards);
        
        // Board has third card
        const communityCards = [
          { rank: tripsRank, suit: tripsSuits[2] }
        ];
        
        // Add cards that make two pair possible for opponent
        const pairRank1 = randomElement(tripsRanks.filter(r => r !== tripsRank));
        const pairRank2 = randomElement(tripsRanks.filter(r => r !== tripsRank && r !== pairRank1));
        communityCards.push({ rank: pairRank1, suit: randomSuit() });
        communityCards.push({ rank: pairRank2, suit: randomSuit() });
        communityCards.push({ rank: randomElement(['7', '8', '9']), suit: randomSuit() });
        communityCards.push({ rank: randomElement(['2', '3', '4']), suit: randomSuit() });
        usedCards.push(...communityCards);
        
        // Opponent gets two pair (loses to trips)
        const opponentHands = [];
        for (let i = 0; i < numOpponents; i++) {
          const availableSuits1 = suits.filter(s => !usedCards.some(c => c.rank === pairRank1 && c.suit === s));
          const availableSuits2 = suits.filter(s => !usedCards.some(c => c.rank === pairRank2 && c.suit === s));
          if (availableSuits1.length >= 1 && availableSuits2.length >= 1) {
            const oppHand = [
              { rank: pairRank1, suit: availableSuits1[0] },
              { rank: pairRank2, suit: availableSuits2[0] }
            ];
            opponentHands.push(oppHand);
            usedCards.push(...oppHand);
          }
        }
        
        return { holeCards, communityCards, opponentHands };
      }
      
      default:
        return null;
    }
  }

  /**
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
    for (const [, req] of this.seatRequests) {
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
    
    // If joining during an active hand, mark to wait for next hand
    player.waitingForNextHand = this.phase !== PHASES.WAITING && this.isGameRunning;

    this.seats[seatIndex] = player;

    return { success: true, seatIndex, waitingForNextHand: player.waitingForNextHand };
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
   * Get seated players (excludes players waiting for next hand during active play)
   */
  getSeatedPlayers() {
    return this.seats.filter(s => s !== null && !s.waitingForNextHand);
  }
  
  /**
   * Get all seated players including those waiting for next hand
   */
  getAllSeatedPlayers() {
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
    // Clear waitingForNextHand flag for all seated players at start of new hand
    for (const player of this.seats) {
      if (player) {
        player.waitingForNextHand = false;
      }
    }
    
    const seatedPlayers = this.getSeatedPlayers();
    
    if (seatedPlayers.length < 2) {
      this.isGameRunning = false;
      return { success: false, error: 'Need at least 2 players' };
    }

    // Reset game state
    this.deck = shuffleDeck(createDeck());
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
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
      // Count opponents for rigging their hands too
      const opponents = seatedPlayers.filter(p => p.socketId !== this.godModePlayer);
      const riggedCards = this.generateRiggedHand(this.riggedHand, opponents.length);
      
      // Remove ALL rigged cards from deck FIRST
      const allRiggedCards = [
        ...riggedCards.holeCards,
        ...riggedCards.communityCards,
        ...(riggedCards.opponentHands || []).flat()
      ];
      this.deck = this.deck.filter(c => 
        !allRiggedCards.some(rc => rc.rank === c.rank && rc.suit === c.suit)
      );
      
      // Store the rigged community cards for later
      this.riggedCommunityCards = riggedCards.communityCards;
      
      // Deal cards - god gets rigged hand, opponents get strong losing hands
      let opponentIndex = 0;
      for (const player of seatedPlayers) {
        if (player.socketId === this.godModePlayer) {
          // Give god mode player the rigged hole cards
          player.cards = riggedCards.holeCards;
        } else if (riggedCards.opponentHands && riggedCards.opponentHands[opponentIndex]) {
          // Give opponent a rigged strong (but losing) hand
          player.cards = riggedCards.opponentHands[opponentIndex];
          opponentIndex++;
        } else {
          // Fallback: deal normally from filtered deck
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
      case ACTIONS.RAISE: {
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
      }
        
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
    const activePlayers = this.getActivePlayers();
    const allPlayersAllIn = actingPlayers.length === 0 && activePlayers.length >= 2;
    
    // Check if Run It Twice should be offered (all-in with cards left to deal)
    if (allPlayersAllIn && !this.runItTwiceOffered && !this.runItTwiceAccepted && this.phase !== PHASES.RIVER) {
      this.offerRunItTwice();
      return; // Wait for votes before continuing
    }

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
        // If Run It Twice was accepted, handle dual showdown
        if (this.runItTwiceAccepted) {
          this.goToRunItTwiceShowdown();
        } else {
          this.goToShowdown();
        }
        return;
      default:
        return;
    }

    // Trigger callback for server to broadcast
    if (this.onAutoAdvance && result?.success) {
      this.onAutoAdvance(this.phase, result);
    }

    // If all players are all-in, automatically run out the board
    if (allPlayersAllIn || this.runItTwiceAccepted) {
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
   * Offer Run It Twice to all-in players
   */
  offerRunItTwice() {
    const activePlayers = this.getActivePlayers();
    this.runItTwiceOffered = true;
    this.runItTwiceVotes = new Map();
    this.runItTwiceEligiblePlayers = activePlayers.map(p => p.socketId);
    
    // Trigger callback to notify players
    if (this.onAutoAdvance) {
      this.onAutoAdvance('run-it-twice-offered', {
        eligiblePlayers: this.runItTwiceEligiblePlayers,
        cardsRemaining: 5 - this.communityCards.length
      });
    }
    
    // Auto-decline after 15 seconds if not all votes received
    setTimeout(() => {
      if (this.runItTwiceOffered && !this.runItTwiceAccepted) {
        this.finalizeRunItTwiceVoting();
      }
    }, 15000);
  }
  
  /**
   * Player votes on Run It Twice
   */
  voteRunItTwice(socketId, accept) {
    if (!this.runItTwiceOffered) {
      return { success: false, error: 'Run It Twice not currently offered' };
    }
    
    if (!this.runItTwiceEligiblePlayers.includes(socketId)) {
      return { success: false, error: 'Not eligible to vote' };
    }
    
    this.runItTwiceVotes.set(socketId, accept);
    
    // Check if all votes are in
    if (this.runItTwiceVotes.size === this.runItTwiceEligiblePlayers.length) {
      this.finalizeRunItTwiceVoting();
    }
    
    return { success: true, vote: accept };
  }
  
  /**
   * Finalize Run It Twice voting
   */
  finalizeRunItTwiceVoting() {
    // All players must accept for RIT to happen
    const allAccepted = this.runItTwiceEligiblePlayers.every(
      socketId => this.runItTwiceVotes.get(socketId) === true
    );
    
    this.runItTwiceOffered = false;
    this.runItTwiceAccepted = allAccepted;
    
    if (this.onAutoAdvance) {
      this.onAutoAdvance('run-it-twice-result', {
        accepted: allAccepted,
        votes: Object.fromEntries(this.runItTwiceVotes)
      });
    }
    
    // Continue dealing the board
    setTimeout(() => {
      if (this.isGameRunning && !this.isPaused) {
        this.advancePhase();
      }
    }, 1000);
  }
  
  /**
   * Deal second board for Run It Twice (called during normal dealing)
   */
  dealSecondBoardCard(count) {
    if (!this.runItTwiceAccepted) return null;
    
    const { dealt, remaining } = dealCards(this.deck, count);
    this.deck = remaining;
    this.secondBoard.push(...dealt);
    return dealt;
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
    
    // Deal second board for Run It Twice
    let secondBoardCards = null;
    if (this.runItTwiceAccepted) {
      this.deck = this.deck.slice(1); // Burn for second board
      const result2 = dealCards(this.deck, 3);
      this.secondBoard = result2.dealt;
      this.deck = result2.remaining;
      secondBoardCards = result2.dealt;
    }

    return { success: true, cards: dealt, secondBoardCards };
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
    
    // Deal second board for Run It Twice
    let secondBoardCard = null;
    if (this.runItTwiceAccepted) {
      this.deck = this.deck.slice(1); // Burn for second board
      const result2 = dealCards(this.deck, 1);
      this.secondBoard.push(result2.dealt[0]);
      this.deck = result2.remaining;
      secondBoardCard = result2.dealt[0];
    }

    return { success: true, card: dealt[0], secondBoardCard };
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
    
    // Deal second board for Run It Twice
    let secondBoardCard = null;
    if (this.runItTwiceAccepted) {
      this.deck = this.deck.slice(1); // Burn for second board
      const result2 = dealCards(this.deck, 1);
      this.secondBoard.push(result2.dealt[0]);
      this.deck = result2.remaining;
      secondBoardCard = result2.dealt[0];
    }

    return { success: true, card: dealt[0], secondBoardCard };
  }
  
  /**
   * Go to Run It Twice showdown - evaluate both boards
   */
  goToRunItTwiceShowdown() {
    this.phase = PHASES.SHOWDOWN;
    
    const activePlayers = this.getActivePlayers();
    
    if (activePlayers.length === 0) {
      return;
    }
    
    // Calculate side pots first
    const sidePots = this.calculateSidePots();
    
    // Evaluate hands for both boards
    const evalBoard1 = activePlayers.map(player => {
      const handResult = evaluateHand(player.cards, this.communityCards);
      return {
        player,
        cards: player.cards,
        handRank: handResult?.rank || 0,
        handDescription: handResult?.description || 'Unknown',
        highCards: handResult?.highCards || []
      };
    });
    
    const evalBoard2 = activePlayers.map(player => {
      const handResult = evaluateHand(player.cards, this.secondBoard);
      return {
        player,
        cards: player.cards,
        handRank: handResult?.rank || 0,
        handDescription: handResult?.description || 'Unknown',
        highCards: handResult?.highCards || []
      };
    });
    
    // Award each side pot split between both boards
    const awards = new Map(); // seatIndex -> { board1: amount, board2: amount }
    
    for (const pot of sidePots) {
      const halfPot = Math.floor(pot.amount / 2);
      const remainder = pot.amount % 2; // Board 1 gets remainder
      
      // Find winner for this pot on board 1
      const eligible1 = evalBoard1.filter(ph => pot.eligibleSeats.includes(ph.player.seatIndex));
      if (eligible1.length > 0) {
        const best1 = this.findBestHand(eligible1);
        const winners1 = eligible1.filter(ph =>
          ph.handRank === best1.handRank &&
          JSON.stringify(ph.highCards) === JSON.stringify(best1.highCards)
        );
        const share1 = Math.floor((halfPot + remainder) / winners1.length);
        const rem1 = (halfPot + remainder) % winners1.length;
        winners1.forEach((w, idx) => {
          const amt = share1 + (idx === 0 ? rem1 : 0);
          w.player.bankroll += amt;
          if (!awards.has(w.player.seatIndex)) {
            awards.set(w.player.seatIndex, { board1: 0, board2: 0 });
          }
          awards.get(w.player.seatIndex).board1 += amt;
        });
      }
      
      // Find winner for this pot on board 2
      const eligible2 = evalBoard2.filter(ph => pot.eligibleSeats.includes(ph.player.seatIndex));
      if (eligible2.length > 0) {
        const best2 = this.findBestHand(eligible2);
        const winners2 = eligible2.filter(ph =>
          ph.handRank === best2.handRank &&
          JSON.stringify(ph.highCards) === JSON.stringify(best2.highCards)
        );
        const share2 = Math.floor(halfPot / winners2.length);
        const rem2 = halfPot % winners2.length;
        winners2.forEach((w, idx) => {
          const amt = share2 + (idx === 0 ? rem2 : 0);
          w.player.bankroll += amt;
          if (!awards.has(w.player.seatIndex)) {
            awards.set(w.player.seatIndex, { board1: 0, board2: 0 });
          }
          awards.get(w.player.seatIndex).board2 += amt;
        });
      }
    }
    
    // Build winners for each board for UI
    const board1Winners = [];
    const board2Winners = [];
    awards.forEach((amounts, seatIndex) => {
      const player = activePlayers.find(p => p.seatIndex === seatIndex);
      const ph1 = evalBoard1.find(ph => ph.player.seatIndex === seatIndex);
      const ph2 = evalBoard2.find(ph => ph.player.seatIndex === seatIndex);
      if (amounts.board1 > 0 && player && ph1) {
        board1Winners.push({
          seatIndex,
          username: player.username,
          handDescription: ph1.handDescription,
          potWon: amounts.board1
        });
      }
      if (amounts.board2 > 0 && player && ph2) {
        board2Winners.push({
          seatIndex,
          username: player.username,
          handDescription: ph2.handDescription,
          potWon: amounts.board2
        });
      }
    });
    
    // Store RIT results
    this.ritResults = {
      board1: {
        communityCards: this.communityCards,
        playerHands: evalBoard1,
        winners: board1Winners
      },
      board2: {
        communityCards: this.secondBoard,
        playerHands: evalBoard2,
        winners: board2Winners
      },
      totalPot: this.pot,
      sidePots
    };
    
    // Create combined showdown data
    this.showdownData = {
      runItTwice: true,
      board1: {
        communityCards: this.communityCards,
        players: evalBoard1.map(ph => ({
          seatIndex: ph.player.seatIndex,
          username: ph.player.username,
          cards: ph.cards,
          handDescription: ph.handDescription,
          handRank: ph.handRank,
          isWinner: board1Winners.some(w => w.seatIndex === ph.player.seatIndex)
        })),
        winners: board1Winners,
        pot: Math.ceil(this.pot / 2)
      },
      board2: {
        communityCards: this.secondBoard,
        players: evalBoard2.map(ph => ({
          seatIndex: ph.player.seatIndex,
          username: ph.player.username,
          cards: ph.cards,
          handDescription: ph.handDescription,
          handRank: ph.handRank,
          isWinner: board2Winners.some(w => w.seatIndex === ph.player.seatIndex)
        })),
        winners: board2Winners,
        pot: Math.floor(this.pot / 2)
      },
      pot: this.pot,
      sidePots
    };
    
    this.pot = 0;
    
    // Trigger showdown event
    if (this.onAutoAdvance) {
      this.onAutoAdvance('showdown', this.showdownData);
    }

    // Auto-start next hand after longer delay
    if (this.isGameRunning && !this.isPaused) {
      setTimeout(() => {
        if (this.isGameRunning && !this.isPaused) {
          this.showdownData = null;
          this.ritResults = null;
          
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
      }, 8000); // Extra time for RIT showdown
    }
  }
  
  /**
   * Helper: Find the best hand from a list of evaluated hands
   */
  findBestHand(playerHands) {
    return playerHands.reduce((best, ph) => {
      if (!best) return ph;
      if (ph.handRank > best.handRank) return ph;
      if (ph.handRank < best.handRank) return best;
      // Compare high cards
      for (let i = 0; i < Math.min(ph.highCards.length, best.highCards.length); i++) {
        if (ph.highCards[i] > best.highCards[i]) return ph;
        if (ph.highCards[i] < best.highCards[i]) return best;
      }
      return best;
    }, null);
  }
  
  /**
   * Helper: Evaluate winners for a specific board
   */
  evaluateBoardWinners(players, communityCards, potAmount) {
    const playerHands = players.map(player => {
      const handResult = evaluateHand(player.cards, communityCards);
      return {
        player,
        cards: player.cards,
        handRank: handResult?.rank || 0,
        handDescription: handResult?.description || 'Unknown',
        highCards: handResult?.highCards || []
      };
    });
    
    // Sort by hand rank
    playerHands.sort((a, b) => {
      if (b.handRank !== a.handRank) return b.handRank - a.handRank;
      for (let i = 0; i < Math.min(a.highCards.length, b.highCards.length); i++) {
        if (b.highCards[i] !== a.highCards[i]) return b.highCards[i] - a.highCards[i];
      }
      return 0;
    });
    
    // Find winners
    const bestHand = playerHands[0];
    const winners = playerHands.filter(ph => 
      ph.handRank === bestHand.handRank &&
      JSON.stringify(ph.highCards) === JSON.stringify(bestHand.highCards)
    );
    
    // Calculate pot share
    const potShare = Math.floor(potAmount / winners.length);
    const winnerRemainder = potAmount % winners.length;
    
    return {
      playerHands,
      winners: winners.map((w, idx) => ({
        seatIndex: w.player.seatIndex,
        username: w.player.username,
        handDescription: w.handDescription,
        potWon: potShare + (idx === 0 ? winnerRemainder : 0)
      }))
    };
  }

  /**
   * Calculate side pots based on player contributions
   * Creates main pot (everyone eligible) and side pots for larger stacks
   */
  calculateSidePots() {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 0) return [];

    // Get all players who contributed to the pot (including folded)
    const contributors = this.seats
      .filter(s => s !== null && s.totalBetThisHand > 0)
      .map(p => ({
        seatIndex: p.seatIndex,
        contribution: p.totalBetThisHand,
        isActive: !p.isFolded  // Only non-folded players can win
      }))
      .sort((a, b) => a.contribution - b.contribution);

    if (contributors.length === 0) return [];

    const pots = [];
    let processedAmount = 0;

    // Get unique contribution levels from active (non-folded) players only
    const activeContributors = contributors.filter(c => c.isActive);
    const uniqueLevels = [...new Set(activeContributors.map(c => c.contribution))].sort((a, b) => a - b);

    for (const level of uniqueLevels) {
      const potAmount = contributors.reduce((sum, c) => {
        const eligibleAmount = Math.min(c.contribution, level) - Math.min(c.contribution, processedAmount);
        return sum + Math.max(0, eligibleAmount);
      }, 0);

      if (potAmount > 0) {
        // Only active players at or above this level can win this pot
        const eligibleSeats = activeContributors
          .filter(c => c.contribution >= level)
          .map(c => c.seatIndex);

        pots.push({
          amount: potAmount,
          eligibleSeats,
          level
        });
      }

      processedAmount = level;
    }

    return pots;
  }

  /**
   * Award pots to winners, handling side pots correctly
   */
  awardPots(playerHands, communityCards) {
    const pots = this.calculateSidePots();
    const awards = new Map(); // seatIndex -> total won

    for (const pot of pots) {
      // Filter to only players eligible for this pot
      const eligibleHands = playerHands.filter(ph => 
        pot.eligibleSeats.includes(ph.player.seatIndex)
      );

      if (eligibleHands.length === 0) continue;

      // Find best hand among eligible players
      const bestHand = eligibleHands.reduce((best, ph) => {
        if (!best) return ph;
        if (ph.handRank > best.handRank) return ph;
        if (ph.handRank < best.handRank) return best;
        // Compare high cards
        for (let i = 0; i < Math.min(ph.highCards.length, best.highCards.length); i++) {
          if (ph.highCards[i] > best.highCards[i]) return ph;
          if (ph.highCards[i] < best.highCards[i]) return best;
        }
        return best; // Tie
      }, null);

      // Find all players with the same best hand (for splits)
      const potWinners = eligibleHands.filter(ph =>
        ph.handRank === bestHand.handRank &&
        JSON.stringify(ph.highCards) === JSON.stringify(bestHand.highCards)
      );

      // Split pot among winners
      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount % potWinners.length;

      potWinners.forEach((winner, idx) => {
        const amount = share + (idx === 0 ? remainder : 0);
        winner.player.bankroll += amount;
        awards.set(winner.player.seatIndex, (awards.get(winner.player.seatIndex) || 0) + amount);
      });
    }

    return awards;
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
    
    // Award pots using side pot logic
    const awards = this.awardPots(playerHands, this.communityCards);
    
    // Find overall winners (those who won something)
    const winners = playerHands.filter(ph => awards.has(ph.player.seatIndex));
    
    // Determine which players must show and who can muck
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
        cards: mustShow.has(ph.player.seatIndex) ? ph.cards : null,
        handDescription: mustShow.has(ph.player.seatIndex) ? ph.handDescription : null,
        handRank: ph.handRank,
        isWinner: awards.has(ph.player.seatIndex),
        mustShow: mustShow.has(ph.player.seatIndex),
        canMuck: canMuck.has(ph.player.seatIndex),
        hasShown: mustShow.has(ph.player.seatIndex),
        hasMucked: false
      })),
      winners: winners.map(w => ({
        seatIndex: w.player.seatIndex,
        username: w.player.username,
        handDescription: w.handDescription,
        potWon: awards.get(w.player.seatIndex) || 0
      })),
      pot: this.pot,
      sidePots: this.calculateSidePots()
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
    
    // Reset Run It Twice state
    this.runItTwiceOffered = false;
    this.runItTwiceAccepted = false;
    this.runItTwiceVotes = new Map();
    this.runItTwiceEligiblePlayers = [];
    this.secondBoard = [];
    this.ritResults = null;

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
          hasCards: player.cards.length > 0,
          waitingForNextHand: player.waitingForNextHand || false
        };
      }),
      communityCards: this.communityCards,
      secondBoard: this.runItTwiceAccepted ? this.secondBoard : null,
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
      showdownData: this.showdownData || null,
      // Run It Twice state
      runItTwiceOffered: this.runItTwiceOffered,
      runItTwiceAccepted: this.runItTwiceAccepted,
      runItTwiceEligiblePlayers: this.runItTwiceEligiblePlayers
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
