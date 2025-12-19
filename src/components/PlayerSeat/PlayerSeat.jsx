/**
 * PlayerSeat Component
 * Represents a single seat around the poker table
 */

import './PlayerSeat.css';
import ChipStack from '../ChipStack';

/**
 * PlayerSeat - Renders a player seat with username and bankroll
 * @param {Object} props
 * @param {number} props.position - Seat position (0-7)
 * @param {Object|null} props.player - Player object or null if empty
 * @param {boolean} props.isLocalPlayer - Whether this is the current user
 * @param {boolean} props.isEmpty - Whether the seat is empty
 * @param {boolean} props.isCurrentTurn - Whether it's this player's turn
 * @param {boolean} props.isDealer - Whether this player is the dealer
 * @param {Function} props.onTakeSeat - Callback when clicking empty seat
 */
function PlayerSeat({ 
  position = 0, 
  player = null, 
  isLocalPlayer = false, 
  isEmpty = true,
  isCurrentTurn = false,
  isDealer = false,
  onTakeSeat = () => {}
}) {
  // Format bankroll with commas
  const formatBankroll = (amount) => {
    return amount.toLocaleString();
  };

  // Build class list
  const classNames = [
    'player-seat',
    `player-seat--pos-${position}`,
    isLocalPlayer && 'player-seat--local',
    isEmpty && 'player-seat--empty',
    isCurrentTurn && 'player-seat--active-turn',
    player?.isFolded && 'player-seat--folded',
    player?.isAllIn && 'player-seat--all-in'
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={classNames}
      data-position={position}
      role="region"
      aria-label={isEmpty ? `Empty seat ${position + 1}` : `${player?.username || 'Player'}'s seat`}
    >
      {isEmpty ? (
        // Empty seat - show "Take Seat" button
        <button 
          className="player-seat__take-btn pixel-btn"
          onClick={() => onTakeSeat(position)}
          aria-label={`Take seat ${position + 1}`}
        >
          Sit
        </button>
      ) : (
        // Occupied seat - show player info
        <div className="player-seat__content animate-fade-in">
          {/* Dealer button */}
          {isDealer && (
            <div className="player-seat__dealer-btn">D</div>
          )}
          
          {/* Avatar placeholder */}
          <div className="player-seat__avatar">
            <span className="player-seat__avatar-icon">
              {player?.isFolded ? '💤' : player?.isAllIn ? '🔥' : '👤'}
            </span>
          </div>
          
          {/* Player info */}
          <div className="player-seat__info">
            <span className="player-seat__username">
              {player?.username || 'Player'}
            </span>
            <div className="player-seat__bankroll-row">
              <ChipStack amount={player?.bankroll || 0} size="small" />
              <span className="player-seat__bankroll">
                ${formatBankroll(player?.bankroll || 0)}
              </span>
            </div>
            
            {/* Current bet indicator */}
            {player?.currentBet > 0 && (
              <div className="player-seat__bet">
                Bet: ${player.currentBet}
              </div>
            )}
          </div>
          
          {/* Status badges */}
          {isLocalPlayer && (
            <div className="player-seat__local-badge">YOU</div>
          )}
          {player?.isFolded && (
            <div className="player-seat__folded-badge">FOLDED</div>
          )}
          {player?.isAllIn && (
            <div className="player-seat__allin-badge">ALL IN</div>
          )}
        </div>
      )}
    </div>
  );
}

export default PlayerSeat;
