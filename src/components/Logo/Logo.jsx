/**
 * Logo Component
 * Pixel-art style 7♠ and 2♣ cards as the sevendeuce logo
 */

import './Logo.css';

/**
 * Logo - Renders the sevendeuce brand logo
 * @param {Object} props
 * @param {string} props.size - 'small' | 'medium' | 'large'
 * @param {boolean} props.showText - Whether to show "sevendeuce" text
 */
function Logo({ size = 'medium', showText = true }) {
  const sizeClass = `logo--${size}`;
  
  return (
    <div className={`logo ${sizeClass}`}>
      <div className="logo__cards">
        {/* 7 of Spades */}
        <div className="logo__card logo__card--seven">
          <span className="logo__card-rank">7</span>
          <span className="logo__card-suit logo__card-suit--spade">♠</span>
        </div>
        {/* 2 of Clubs */}
        <div className="logo__card logo__card--deuce">
          <span className="logo__card-rank">2</span>
          <span className="logo__card-suit logo__card-suit--club">♣</span>
        </div>
      </div>
      {showText && (
        <h1 className="logo__text">sevendeuce</h1>
      )}
    </div>
  );
}

export default Logo;
