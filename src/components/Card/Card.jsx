/**
 * Card Component
 * Pixel-art playing card display
 */

import './Card.css';

// Suit symbols and colors
const SUIT_INFO = {
  hearts: { symbol: '♥', color: 'red' },
  diamonds: { symbol: '♦', color: 'red' },
  clubs: { symbol: '♣', color: 'black' },
  spades: { symbol: '♠', color: 'black' }
};

/**
 * Card - Renders a playing card
 * @param {Object} props
 * @param {string} props.rank - Card rank (2-10, J, Q, K, A)
 * @param {string} props.suit - Card suit (hearts, diamonds, clubs, spades)
 * @param {boolean} props.faceDown - Whether to show card back
 * @param {string} props.size - 'small' | 'medium' | 'large'
 * @param {boolean} props.dealing - Animation for dealing
 */
function Card({ 
  rank, 
  suit, 
  faceDown = false, 
  size = 'medium',
  dealing = false 
}) {
  const suitInfo = SUIT_INFO[suit] || { symbol: '?', color: 'black' };
  
  if (faceDown) {
    return (
      <div className={`card card--back card--${size} ${dealing ? 'card--dealing' : ''}`}>
        <div className="card__back-pattern">
          <span className="card__back-logo">7♠2♣</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`card card--${suitInfo.color} card--${size} ${dealing ? 'card--dealing' : ''}`}
    >
      <div className="card__corner card__corner--top">
        <span className="card__rank">{rank}</span>
        <span className="card__suit">{suitInfo.symbol}</span>
      </div>
      <div className="card__center">
        <span className="card__suit-large">{suitInfo.symbol}</span>
      </div>
      <div className="card__corner card__corner--bottom">
        <span className="card__rank">{rank}</span>
        <span className="card__suit">{suitInfo.symbol}</span>
      </div>
    </div>
  );
}

export default Card;
