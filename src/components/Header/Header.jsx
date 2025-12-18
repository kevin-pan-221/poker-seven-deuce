/**
 * Header Component
 * Top navigation bar with logo and controls
 */

import './Header.css';
import Logo from '../Logo';

/**
 * Header - Site header with logo and navigation
 * @param {Object} props
 * @param {string} props.playerName - Current player name (if any)
 */
function Header({ playerName = null }) {
  return (
    <header className="header">
      <div className="header__content">
        {/* Logo */}
        <div className="header__logo">
          <Logo size="small" showText={true} />
        </div>
        
        {/* Navigation/Status */}
        <nav className="header__nav">
          {playerName ? (
            <div className="header__player-info">
              <span className="header__player-icon">👤</span>
              <span className="header__player-name">{playerName}</span>
            </div>
          ) : (
            <span className="header__status">Not seated</span>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;
