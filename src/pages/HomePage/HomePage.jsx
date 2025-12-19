/**
 * Home Page
 * Landing page for creating or joining games
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';
import Logo from '../../components/Logo';
import { createRoom, listRooms } from '../../services/api';
import socketService from '../../services/socket';

function HomePage() {
  const navigate = useNavigate();
  const [gameName, setGameName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch existing rooms on mount
  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const roomList = await listRooms();
      setRooms(roomList);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  };

  /**
   * Create a new game room
   */
  const handleCreateGame = async (e) => {
    e.preventDefault();
    const trimmedName = gameName.trim();
    
    if (!trimmedName) {
      setError('Please enter a game name');
      return;
    }
    
    if (trimmedName.length < 1 || trimmedName.length > 30) {
      setError('Game name must be 1-30 characters');
      return;
    }
    
    // Basic sanitization
    if (/<[^>]*>/g.test(trimmedName)) {
      setError('Game name contains invalid characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const hostId = socketService.getSessionId();
      const result = await createRoom(trimmedName, hostId);
      
      // Navigate to the game room
      navigate(`/game/${result.roomId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Join an existing game
   */
  const handleJoinGame = (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      setError('Please enter a game code');
      return;
    }

    // Navigate to the game room
    navigate(`/game/${joinCode.trim()}`);
  };

  /**
   * Join from room list
   */
  const handleJoinFromList = (roomId) => {
    navigate(`/game/${roomId}`);
  };

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="home-hero" aria-label="Welcome">
        <Logo size="large" showText={true} />
        <p className="home-hero__tagline">
          Casual poker with friends. No money, just fun.
        </p>
      </section>

      {/* Main Actions */}
      <section className="home-actions" aria-label="Game options">
        {/* Create Game */}
        <div className="home-card" role="region" aria-label="Create a new game">
          <h2 className="home-card__title pixel-text">Create Game</h2>
          <p className="home-card__desc">
            Start a new table and invite your friends
          </p>
          <form onSubmit={handleCreateGame} className="home-form">
            <label htmlFor="game-name" className="visually-hidden">Game name</label>
            <input
              id="game-name"
              type="text"
              className="home-input"
              placeholder="Game name..."
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              maxLength={30}
              aria-describedby="game-name-hint"
            />
            <span id="game-name-hint" className="visually-hidden">Enter a name for your poker game, 1-30 characters</span>
            <button 
              type="submit" 
              className="pixel-btn home-btn"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>

        {/* Join Game */}
        <div className="home-card" role="region" aria-label="Join an existing game">
          <h2 className="home-card__title pixel-text">Join Game</h2>
          <p className="home-card__desc">
            Enter a game code from your friend
          </p>
          <form onSubmit={handleJoinGame} className="home-form">
            <label htmlFor="join-code" className="visually-hidden">Game code</label>
            <input
              id="join-code"
              type="text"
              className="home-input"
              placeholder="Game code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={10}
              aria-describedby="join-code-hint"
            />
            <span id="join-code-hint" className="visually-hidden">Enter the 8-character game code</span>
            <button 
              type="submit" 
              className="pixel-btn home-btn"
              aria-label="Join game with code"
            >
              Join
            </button>
          </form>
        </div>
      </section>

      {/* Error Display */}
      {error && (
        <div className="home-error animate-fade-in" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      {/* Active Games List */}
      {rooms.length > 0 && (
        <section className="home-rooms" aria-label="Active games">
          <h3 className="home-rooms__title pixel-text">Active Tables</h3>
          <div className="home-rooms__list" role="list">
            {rooms.map((room) => (
              <div key={room.id} className="home-room-item" role="listitem">
                <div className="home-room-item__info">
                  <span className="home-room-item__name">{room.name}</span>
                  <span className="home-room-item__players" aria-label={`${room.playerCount} of ${room.maxPlayers} players`}>
                    {room.playerCount}/{room.maxPlayers} players
                  </span>
                </div>
                <button
                  className="pixel-btn home-room-item__btn"
                  onClick={() => handleJoinFromList(room.id)}
                  aria-label={`Join ${room.name}`}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="home-footer">
        <p>🎴 Play for fun, not for money</p>
      </footer>
    </div>
  );
}

export default HomePage;
