/**
 * PokerTable Component
 * Main poker table with seats arranged around it
 */

import './PokerTable.css';
import PlayerSeat from '../PlayerSeat';
import Card from '../Card';

/**
 * PokerTable - Renders the central table with all player seats
 * @param {Object} props
 * @param {Array} props.seats - Array of 8 seat objects (player or null)
 * @param {number|null} props.localPlayerSeat - Seat index of local player
 * @param {Function} props.onTakeSeat - Callback when a seat is taken
 * @param {string} props.tableName - Name of the table
 * @param {Array} props.communityCards - Cards on the board
 * @param {Array} props.secondBoard - Second board for Run It Twice
 * @param {number} props.pot - Current pot amount
 * @param {string} props.phase - Current game phase
 * @param {number|null} props.currentTurn - Seat index of current actor
 * @param {number} props.dealerSeat - Seat index of dealer
 * @param {boolean} props.runItTwiceAccepted - Whether Run It Twice is active
 */
function PokerTable({ 
  seats = Array(8).fill(null),
  localPlayerSeat = null,
  onTakeSeat = () => {},
  tableName = "Table 1",
  communityCards = [],
  secondBoard = [],
  pot = 0,
  phase = 'waiting',
  currentTurn = null,
  dealerSeat = -1,
  runItTwiceAccepted = false
}) {
  return (
    <div className="poker-table-container">
      {/* Table name */}
      {tableName && (
        <div className="poker-table__name pixel-text">
          {tableName}
        </div>
      )}
      
      {/* The table itself */}
      <div className="poker-table">
        {/* Table felt surface */}
        <div className="poker-table__felt">
          {/* Center logo/decoration - only show when no cards */}
          {communityCards.length === 0 && (
            <div className="poker-table__center">
              <span className="poker-table__logo">7♠ 2♣</span>
            </div>
          )}
          
          {/* Run It Twice: Show both boards */}
          {runItTwiceAccepted && communityCards.length > 0 ? (
            <div className="poker-table__dual-boards">
              {/* Board 1 */}
              <div className="poker-table__board poker-table__board--first">
                <span className="poker-table__board-label">Board 1</span>
                <div className="poker-table__community-cards">
                  {communityCards.map((card, i) => (
                    <Card 
                      key={i}
                      rank={card.rank}
                      suit={card.suit}
                      size="small"
                      dealing={true}
                    />
                  ))}
                  {Array.from({ length: 5 - communityCards.length }).map((_, i) => (
                    <div key={`empty-1-${i}`} className="poker-table__card-slot poker-table__card-slot--small" />
                  ))}
                </div>
              </div>
              
              {/* Board 2 */}
              <div className="poker-table__board poker-table__board--second">
                <span className="poker-table__board-label">Board 2</span>
                <div className="poker-table__community-cards">
                  {secondBoard.map((card, i) => (
                    <Card 
                      key={i}
                      rank={card.rank}
                      suit={card.suit}
                      size="small"
                      dealing={true}
                    />
                  ))}
                  {Array.from({ length: 5 - secondBoard.length }).map((_, i) => (
                    <div key={`empty-2-${i}`} className="poker-table__card-slot poker-table__card-slot--small" />
                  ))}
                </div>
              </div>
            </div>
          ) : communityCards.length > 0 && (
            /* Single board (normal play) */
            <div className="poker-table__community-cards">
              {communityCards.map((card, i) => (
                <Card 
                  key={i}
                  rank={card.rank}
                  suit={card.suit}
                  size="medium"
                  dealing={true}
                />
              ))}
              {/* Placeholder slots for remaining cards */}
              {Array.from({ length: 5 - communityCards.length }).map((_, i) => (
                <div key={`empty-${i}`} className="poker-table__card-slot" />
              ))}
            </div>
          )}
          
          {/* Pot area */}
          <div className="poker-table__pot">
            <span className="poker-table__pot-label">POT</span>
            <span className="poker-table__pot-amount">${pot.toLocaleString()}</span>
          </div>
          
          {/* Phase indicator */}
          {phase !== 'waiting' && (
            <div className="poker-table__phase">
              {phase.toUpperCase().replace('-', ' ')}
            </div>
          )}
        </div>
        
        {/* Player seats positioned around the table */}
        {seats.map((player, index) => (
          <PlayerSeat
            key={index}
            position={index}
            player={player}
            isEmpty={player === null}
            isLocalPlayer={index === localPlayerSeat}
            isCurrentTurn={index === currentTurn}
            isDealer={index === dealerSeat}
            onTakeSeat={onTakeSeat}
          />
        ))}
      </div>
      
      {/* Table info */}
      <div className="poker-table__info">
        <span className="poker-table__info-item">
          Players: {seats.filter(s => s !== null).length}/8
        </span>
        <span className="poker-table__info-item">
          Blinds: $10/$20
        </span>
      </div>
    </div>
  );
}

export default PokerTable;
