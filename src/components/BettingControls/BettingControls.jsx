/**
 * BettingControls Component
 * Displays betting action buttons and bet slider
 */

import { useState, useEffect } from 'react';
import './BettingControls.css';

// Action types matching backend
const ACTIONS = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise'
};

function BettingControls({ 
  validActions = [], 
  toCall = 0, 
  minRaise = 20,
  pot = 0,
  myBankroll = 0,
  onAction,
  isMyTurn = false,
  disabled = false
}) {
  const [betAmount, setBetAmount] = useState(minRaise);
  const [showSlider, setShowSlider] = useState(false);

  // Reset bet amount when minRaise changes
  useEffect(() => {
    setBetAmount(minRaise);
  }, [minRaise]);

  const canFold = validActions.includes(ACTIONS.FOLD);
  const canCheck = validActions.includes(ACTIONS.CHECK);
  const canCall = validActions.includes(ACTIONS.CALL);
  const canBet = validActions.includes(ACTIONS.BET);
  const canRaise = validActions.includes(ACTIONS.RAISE);

  const handleFold = () => {
    onAction(ACTIONS.FOLD);
  };

  const handleCheck = () => {
    onAction(ACTIONS.CHECK);
  };

  const handleCall = () => {
    onAction(ACTIONS.CALL);
  };

  const handleBetOrRaise = () => {
    if (showSlider) {
      // Confirm the bet
      const action = canBet ? ACTIONS.BET : ACTIONS.RAISE;
      onAction(action, betAmount);
      setShowSlider(false);
    } else {
      // Show the slider
      setShowSlider(true);
    }
  };

  const handleCancelBet = () => {
    setShowSlider(false);
    setBetAmount(minRaise);
  };

  // Quick bet buttons
  const handleQuickBet = (multiplier) => {
    let amount;
    if (multiplier === 'pot') {
      amount = pot;
    } else if (multiplier === 'allin') {
      amount = myBankroll;
    } else {
      amount = Math.floor(pot * multiplier);
    }
    // Ensure minimum
    amount = Math.max(amount, minRaise);
    // Ensure maximum (all-in)
    amount = Math.min(amount, myBankroll);
    setBetAmount(amount);
  };

  if (!isMyTurn || validActions.length === 0) {
    return (
      <div className="betting-controls betting-controls--waiting" role="status" aria-live="polite">
        <span className="betting-controls__waiting-text">
          {isMyTurn ? 'Loading actions...' : 'Waiting for your turn...'}
        </span>
      </div>
    );
  }

  return (
    <div className="betting-controls" role="group" aria-label="Betting controls">
      {showSlider ? (
        // Bet/Raise amount selection
        <div className="betting-controls__slider-panel" role="group" aria-label="Bet amount selector">
          <div className="betting-controls__amount-display">
            <span className="betting-controls__amount-label" id="bet-amount-label">
              {canBet ? 'Bet' : 'Raise to'}:
            </span>
            <span className="betting-controls__amount-value" aria-live="polite">${betAmount}</span>
          </div>
          
          <input
            type="range"
            className="betting-controls__slider"
            min={minRaise}
            max={myBankroll}
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
            aria-labelledby="bet-amount-label"
            aria-valuemin={minRaise}
            aria-valuemax={myBankroll}
            aria-valuenow={betAmount}
            disabled={disabled}
          />
          
          <div className="betting-controls__quick-bets" role="group" aria-label="Quick bet amounts">
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet(0.33)}
              aria-label="Bet one third of pot"
              disabled={disabled}
            >
              1/3
            </button>
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet(0.5)}
              aria-label="Bet half of pot"
              disabled={disabled}
            >
              1/2
            </button>
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet(0.75)}
              aria-label="Bet three quarters of pot"
              disabled={disabled}
            >
              3/4
            </button>
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet('pot')}
              aria-label="Bet full pot"
              disabled={disabled}
            >
              Pot
            </button>
            <button 
              className="betting-controls__quick-btn betting-controls__quick-btn--allin"
              onClick={() => handleQuickBet('allin')}
              aria-label="Go all in"
              disabled={disabled}
            >
              All-In
            </button>
          </div>
          
          <div className="betting-controls__slider-actions">
            <button 
              className="betting-controls__btn betting-controls__btn--cancel"
              onClick={handleCancelBet}
              disabled={disabled}
            >
              Cancel
            </button>
            <button 
              className="betting-controls__btn betting-controls__btn--confirm"
              onClick={handleBetOrRaise}
              disabled={disabled}
            >
              {canBet ? 'Bet' : 'Raise'} ${betAmount}
            </button>
          </div>
        </div>
      ) : (
        // Main action buttons
        <div className="betting-controls__actions" role="group" aria-label="Available actions">
          {canFold && (
            <button 
              className="betting-controls__btn betting-controls__btn--fold"
              onClick={handleFold}
              aria-label="Fold your hand"
              disabled={disabled}
            >
              Fold
            </button>
          )}
          
          {canCheck && (
            <button 
              className="betting-controls__btn betting-controls__btn--check"
              onClick={handleCheck}
              aria-label="Check, no bet"
              disabled={disabled}
            >
              Check
            </button>
          )}
          
          {canCall && (
            <button 
              className="betting-controls__btn betting-controls__btn--call"
              onClick={handleCall}
              aria-label={`Call ${toCall} dollars`}
              disabled={disabled}
            >
              Call ${toCall}
            </button>
          )}
          
          {(canBet || canRaise) && (
            <button 
              className="betting-controls__btn betting-controls__btn--raise"
              onClick={handleBetOrRaise}
              aria-label={canBet ? 'Open bet slider' : 'Open raise slider'}
              disabled={disabled}
            >
              {canBet ? 'Bet' : 'Raise'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default BettingControls;
