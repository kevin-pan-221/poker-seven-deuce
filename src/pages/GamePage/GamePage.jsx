/**
 * Game Page
 * The actual poker table with multiplayer support and betting
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './GamePage.css';
import Header from '../../components/Header';
import PokerTable from '../../components/PokerTable';
import Card from '../../components/Card';
import BettingControls from '../../components/BettingControls';
import socketService from '../../services/socket';
import soundService from '../../services/sounds';

// Game phases
const PHASES = {
  WAITING: 'waiting',
  PRE_FLOP: 'pre-flop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown'
};

function GamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  // Connection state
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  
  // Game state from server
  const [roomState, setRoomState] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [mySeatIndex, setMySeatIndex] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [validActions, setValidActions] = useState([]);
  const [toCall, setToCall] = useState(0);
  const [myHandDescription, setMyHandDescription] = useState('');
  
  // UI state
  const [username, setUsername] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [gameEvents, setGameEvents] = useState([]);
  
  // Seat request state
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [buyInAmount, setBuyInAmount] = useState(1000);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Refs for tracking state changes (for sounds)
  const prevCardsRef = useRef([]);
  const prevTurnRef = useRef(null);

  /**
   * Initialize socket connection
   */
  useEffect(() => {
    const socket = socketService.connect();
    
    const handleConnect = () => {
      console.log('Socket connected');
      setConnected(true);
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setConnected(false);
    };

    const handleRoomState = (state) => {
      console.log('Room state received:', state);
      // Track turn changes for sound
      prevTurnRef.current = state.currentTurn;
      setRoomState(state);
    };

    const handlePlayerState = (state) => {
      console.log('Player state received:', state);
      
      // Play card dealt sound when receiving new cards
      const newCards = state.myCards || [];
      if (newCards.length > prevCardsRef.current.length && newCards.length > 0) {
        soundService.cardDealt();
        setTimeout(() => soundService.cardDealt(), 150);
      }
      prevCardsRef.current = newCards;
      
      // Play your turn sound
      if (state.mySeatIndex !== null && 
          state.validActions?.length > 0 && 
          prevTurnRef.current !== state.mySeatIndex) {
        // Small delay to not overlap with other sounds
        setTimeout(() => soundService.yourTurn(), 300);
      }
      
      setMyCards(newCards);
      setMySeatIndex(state.mySeatIndex);
      setIsHost(state.isHost);
      setValidActions(state.validActions || []);
      setToCall(state.toCall || 0);
      setPendingRequest(state.myPendingRequest || null);
      setMyHandDescription(state.myHandDescription || '');
    };

    const handleGameEvent = (event) => {
      console.log('Game event:', event);
      setGameEvents(prev => [...prev.slice(-4), event]);
      
      if (event.type === 'hand-reset' || event.type === 'game-stopped') {
        setMyCards([]);
        prevCardsRef.current = [];
      }
      
      // Sound effects for game events
      if (event.type === 'new-hand' || event.type === 'game-started') {
        soundService.newHand();
      }
      if (event.type === 'flop') {
        soundService.flopDealt();
      }
      if (event.type === 'turn' || event.type === 'river') {
        soundService.communityCard();
      }
      if (event.type === 'player-action') {
        switch (event.action) {
          case 'CHECK': soundService.check(); break;
          case 'CALL': soundService.call(); break;
          case 'BET': case 'RAISE': soundService.bet(); break;
          case 'FOLD': soundService.fold(); break;
          case 'ALL_IN': soundService.allIn(); break;
        }
      }
      if (event.type === 'showdown') {
        soundService.win();
      }
      
      // Handle seat approval/denial notifications
      if (event.type === 'your-seat-approved') {
        setPendingRequest(null);
        soundService.click();
        setGameEvents(prev => [...prev.slice(-4), { type: 'info', message: '✅ Seat approved!' }]);
      }
      if (event.type === 'your-seat-denied') {
        setPendingRequest(null);
        soundService.error();
        setGameEvents(prev => [...prev.slice(-4), { type: 'info', message: '❌ Seat request denied' }]);
      }
      
      // Handle bust notification
      if (event.type === 'players-busted' && event.bustedPlayers) {
        event.bustedPlayers.forEach(p => {
          setGameEvents(prev => [...prev.slice(-4), { 
            type: 'info', 
            message: `💸 ${p.username} busted out!` 
          }]);
        });
      }
      
      // Handle host change
      if (event.type === 'you-are-host') {
        setIsHost(true);
        soundService.yourTurn();
        setGameEvents(prev => [...prev.slice(-4), { type: 'info', message: '👑 You are now the host!' }]);
      }
      if (event.type === 'host-changed') {
        setGameEvents(prev => [...prev.slice(-4), { type: 'info', message: `👑 ${event.newHost} is now the host` }]);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('room-state', handleRoomState);
    socket.on('player-state', handlePlayerState);
    socket.on('game-event', handleGameEvent);

    // Check if already connected
    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room-state', handleRoomState);
      socket.off('player-state', handlePlayerState);
      socket.off('game-event', handleGameEvent);
    };
  }, []);

  /**
   * Join the room with username
   */
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setJoining(true);
    setError('');

    try {
      const result = await socketService.joinRoom(roomId, username.trim());
      setRoomState(result.state);
      setMyCards(result.state.myCards || []);
      setMySeatIndex(result.state.mySeatIndex);
      setIsHost(result.state.isHost);
      setValidActions(result.state.validActions || []);
      setToCall(result.state.toCall || 0);
      setShowJoinModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  };

  /**
   * Open buy-in modal for a seat
   */
  const handleTakeSeat = (seatIndex) => {
    setSelectedSeat(seatIndex);
    setBuyInAmount(1000);
    setShowBuyInModal(true);
  };

  /**
   * Submit seat request with buy-in amount
   */
  const handleSubmitBuyIn = async (e) => {
    e.preventDefault();
    if (selectedSeat === null) return;
    
    try {
      const result = await socketService.takeSeat(selectedSeat, buyInAmount);
      setShowBuyInModal(false);
      if (result.pending) {
        setPendingRequest({ seatIndex: selectedSeat, buyIn: buyInAmount });
        setGameEvents(prev => [...prev.slice(-4), { type: 'info', message: '⏳ Waiting for host approval...' }]);
      }
    } catch (err) {
      console.error('Failed to request seat:', err);
      setError(err.message);
    }
  };

  /**
   * Cancel seat request
   */
  const handleCancelRequest = async () => {
    try {
      await socketService.cancelSeatRequest();
      setPendingRequest(null);
    } catch (err) {
      console.error('Failed to cancel request:', err);
    }
  };

  /**
   * Approve a seat request (host only)
   */
  const handleApproveSeat = async (requestId) => {
    try {
      await socketService.approveSeat(requestId);
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Deny a seat request (host only)
   */
  const handleDenySeat = async (requestId) => {
    try {
      await socketService.denySeat(requestId);
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Leave current seat
   */
  const handleLeaveSeat = async () => {
    try {
      await socketService.leaveSeat();
    } catch (err) {
      console.error('Failed to leave seat:', err);
    }
  };

  /**
   * Start the game
   */
  const handleStartGame = async () => {
    try {
      await socketService.startGame();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Pause the game
   */
  const handlePauseGame = async () => {
    try {
      await socketService.pauseGame();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Resume the game
   */
  const handleResumeGame = async () => {
    try {
      await socketService.resumeGame();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Stop the game
   */
  const handleStopGame = async () => {
    try {
      await socketService.stopGame();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Handle betting action
   */
  const handleBettingAction = async (action, amount = 0) => {
    try {
      await socketService.playerAction(action, amount);
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Leave the game
   */
  const handleLeaveGame = () => {
    socketService.leaveRoom();
    navigate('/');
  };

  /**
   * Copy invite link
   */
  const handleCopyLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setGameEvents(prev => [...prev.slice(-4), { type: 'info', message: 'Link copied!' }]);
  };

  /**
   * Check if it's my turn
   */
  const isMyTurn = roomState?.currentTurn === mySeatIndex && mySeatIndex !== null;

  /**
   * Get my bankroll
   */
  const myBankroll = mySeatIndex !== null && roomState?.seats?.[mySeatIndex] 
    ? roomState.seats[mySeatIndex].bankroll 
    : 0;

  /**
   * Get game control buttons based on state
   */
  const getGameControlButtons = () => {
    if (!roomState) return null;
    
    const seatedCount = roomState.seats.filter(s => s !== null).length;
    const { isGameRunning, isPaused, phase } = roomState;
    
    // Game not started
    if (!isGameRunning) {
      if (seatedCount < 2) {
        return <span className="game-controls__hint">Need 2+ players to start</span>;
      }
      return (
        <button className="pixel-btn game-controls__btn game-controls__btn--start" onClick={handleStartGame}>
          ▶ Start Game
        </button>
      );
    }
    
    // Game is running
    if (isPaused) {
      return (
        <>
          <span className="game-controls__status game-controls__status--paused">⏸ PAUSED</span>
          <button className="pixel-btn game-controls__btn" onClick={handleResumeGame}>
            ▶ Resume
          </button>
          <button className="pixel-btn game-controls__btn game-controls__btn--stop" onClick={handleStopGame}>
            ■ End Game
          </button>
        </>
      );
    }
    
    // Game is active
    return (
      <>
        <span className="game-controls__status">
          Hand #{roomState.handNumber} • {phase.toUpperCase()}
        </span>
        <button className="pixel-btn game-controls__btn game-controls__btn--pause" onClick={handlePauseGame}>
          ⏸ Pause
        </button>
      </>
    );
  };

  /**
   * Get turn indicator
   */
  const getTurnIndicator = () => {
    if (!roomState || !roomState.isGameRunning || roomState.phase === PHASES.WAITING || roomState.phase === PHASES.SHOWDOWN) {
      return null;
    }
    
    const currentPlayer = roomState.seats[roomState.currentTurn];
    if (!currentPlayer) return null;
    
    if (isMyTurn) {
      return <span className="turn-indicator turn-indicator--you">🎯 YOUR TURN</span>;
    }
    
    return (
      <span className="turn-indicator">
        Waiting for {currentPlayer.username}...
      </span>
    );
  };

  // Join Modal
  if (showJoinModal) {
    return (
      <div className="game-page">
        <div className="join-modal">
          <h2 className="join-modal__title pixel-text">Join Game</h2>
          <p className="join-modal__room">Room: {roomId}</p>
          
          <form onSubmit={handleJoinRoom} className="join-modal__form">
            <input
              type="text"
              className="home-input"
              placeholder="Your name..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={15}
              autoFocus
            />
            <button 
              type="submit" 
              className="pixel-btn"
              disabled={joining || !connected}
            >
              {!connected ? 'Connecting...' : joining ? 'Joining...' : 'Enter Game'}
            </button>
          </form>
          
          {error && <div className="join-modal__error">{error}</div>}
          
          <button className="join-modal__back" onClick={() => navigate('/')}>
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page">
      <Header playerName={username} />
      
      {/* Buy-In Modal */}
      {showBuyInModal && (
        <div className="modal-overlay" onClick={() => setShowBuyInModal(false)}>
          <div className="buy-in-modal" onClick={e => e.stopPropagation()}>
            <h3 className="pixel-text">Buy In</h3>
            <p>Seat #{selectedSeat + 1}</p>
            <form onSubmit={handleSubmitBuyIn}>
              <div className="buy-in-modal__input-group">
                <label>Amount:</label>
                <input
                  type="number"
                  className="home-input"
                  value={buyInAmount}
                  onChange={(e) => setBuyInAmount(Math.max(200, parseInt(e.target.value) || 200))}
                  min={200}
                  step={100}
                />
              </div>
              <div className="buy-in-modal__presets">
                <button type="button" className="pixel-btn pixel-btn--small" onClick={() => setBuyInAmount(500)}>$500</button>
                <button type="button" className="pixel-btn pixel-btn--small" onClick={() => setBuyInAmount(1000)}>$1000</button>
                <button type="button" className="pixel-btn pixel-btn--small" onClick={() => setBuyInAmount(2000)}>$2000</button>
              </div>
              <div className="buy-in-modal__actions">
                <button type="button" className="pixel-btn pixel-btn--secondary" onClick={() => setShowBuyInModal(false)}>Cancel</button>
                <button type="submit" className="pixel-btn">{isHost ? 'Take Seat' : 'Request Seat'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Host Seat Request Panel */}
      {isHost && roomState?.seatRequests?.length > 0 && (
        <div className="seat-requests-panel animate-fade-in">
          <h4 className="pixel-text">🔔 Seat Requests</h4>
          {roomState.seatRequests.map(req => (
            <div key={req.requestId} className="seat-request">
              <span className="seat-request__info">
                <strong>{req.username}</strong> wants Seat #{req.seatIndex + 1} (${req.buyIn})
              </span>
              <div className="seat-request__actions">
                <button 
                  className="pixel-btn pixel-btn--small pixel-btn--approve"
                  onClick={() => handleApproveSeat(req.requestId)}
                >
                  ✓
                </button>
                <button 
                  className="pixel-btn pixel-btn--small pixel-btn--deny"
                  onClick={() => handleDenySeat(req.requestId)}
                >
                  ✗
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Pending Request Indicator */}
      {pendingRequest && (
        <div className="pending-request animate-fade-in">
          <span>⏳ Waiting for host to approve your seat request...</span>
          <button className="pixel-btn pixel-btn--small" onClick={handleCancelRequest}>Cancel</button>
        </div>
      )}
      
      <main className="game-main">
        {/* Room Info Bar */}
        <div className="game-info-bar">
          <div className="game-info-bar__left">
            <span className="game-info-bar__name">{roomState?.name || 'Game'}</span>
            <span className="game-info-bar__code">Code: {roomId}</span>
            {roomState?.isGameRunning && (
              <span className="game-info-bar__blinds">
                Blinds: ${roomState.smallBlind}/${roomState.bigBlind}
              </span>
            )}
          </div>
          <div className="game-info-bar__right">
            <button 
              className={`pixel-btn game-info-bar__btn game-info-bar__btn--sound ${!soundEnabled ? 'muted' : ''}`}
              onClick={() => {
                const enabled = soundService.toggle();
                setSoundEnabled(enabled);
              }}
              title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button className="pixel-btn game-info-bar__btn" onClick={handleCopyLink}>
              Copy Link
            </button>
            <span className={`game-info-bar__status ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Online' : '○ Offline'}
            </span>
          </div>
        </div>

        {/* Turn Indicator */}
        {getTurnIndicator()}

        {/* Poker Table */}
        <PokerTable
          seats={roomState?.seats || Array(8).fill(null)}
          localPlayerSeat={mySeatIndex}
          onTakeSeat={handleTakeSeat}
          tableName=""
          communityCards={roomState?.communityCards || []}
          pot={roomState?.pot || 0}
          phase={roomState?.phase || PHASES.WAITING}
          currentTurn={roomState?.currentTurn}
          dealerSeat={roomState?.dealerSeat}
        />

        {/* My Cards */}
        {myCards.length > 0 && (
          <div className="my-cards animate-fade-in">
            <span className="my-cards__label pixel-text">Your Hand</span>
            <div className="my-cards__cards">
              {myCards.map((card, i) => (
                <Card 
                  key={i} 
                  rank={card.rank} 
                  suit={card.suit} 
                  size="large"
                  dealing={true}
                />
              ))}
            </div>
            {myHandDescription && (
              <div className="my-cards__hand-name">
                <span className="my-cards__hand-label">{myHandDescription}</span>
              </div>
            )}
          </div>
        )}

        {/* Betting Controls - only show when seated and game is active */}
        {mySeatIndex !== null && roomState?.isGameRunning && roomState?.phase !== PHASES.WAITING && roomState?.phase !== PHASES.SHOWDOWN && (
          <BettingControls
            validActions={validActions}
            toCall={toCall}
            minRaise={roomState?.minRaise || 20}
            pot={roomState?.pot || 0}
            myBankroll={myBankroll}
            onAction={handleBettingAction}
            isMyTurn={isMyTurn}
          />
        )}

        {/* Game Controls */}
        <div className="game-controls">
          {getGameControlButtons()}
          
          {mySeatIndex !== null && !roomState?.isGameRunning && (
            <button 
              className="pixel-btn game-controls__btn game-controls__btn--leave"
              onClick={handleLeaveSeat}
            >
              Leave Seat
            </button>
          )}
          
          {mySeatIndex === null && (
            <span className="game-controls__hint">Click an empty seat to sit down</span>
          )}
          
          <button 
            className="pixel-btn game-controls__btn game-controls__btn--exit"
            onClick={handleLeaveGame}
          >
            Exit Game
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="game-error animate-fade-in">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        {/* Game Events Log */}
        <div className="game-events">
          {gameEvents.map((event, i) => (
            <div key={i} className="game-event animate-slide-up">
              {event.type === 'game-started' && '🎮 Game started!'}
              {event.type === 'new-hand' && '🃏 New hand dealt!'}
              {event.type === 'flop' && '🃏 Flop dealt!'}
              {event.type === 'turn' && '🃏 Turn dealt!'}
              {event.type === 'river' && '🃏 River dealt!'}
              {event.type === 'showdown' && '🏆 Showdown!'}
              {event.type === 'game-paused' && '⏸ Game paused'}
              {event.type === 'game-resumed' && '▶ Game resumed'}
              {event.type === 'game-stopped' && '■ Game ended'}
              {event.type === 'player-action' && `${event.username}: ${event.action}${event.amount ? ` $${event.amount}` : ''}`}
              {event.type === 'info' && event.message}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default GamePage;
