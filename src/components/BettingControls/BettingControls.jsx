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
  isMyTurn = false 
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
      <div className="betting-controls betting-controls--waiting">
        <span className="betting-controls__waiting-text">
          {isMyTurn ? 'Loading...' : 'Waiting for your turn...'}
        </span>
      </div>
    );
  }

  return (
    <div className="betting-controls">
      {showSlider ? (
        // Bet/Raise amount selection
        <div className="betting-controls__slider-panel">
          <div className="betting-controls__amount-display">
            <span className="betting-controls__amount-label">
              {canBet ? 'Bet' : 'Raise to'}:
            </span>
            <span className="betting-controls__amount-value">${betAmount}</span>
          </div>
          
          <input
            type="range"
            className="betting-controls__slider"
            min={minRaise}
            max={myBankroll}
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
          />
          
          <div className="betting-controls__quick-bets">
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet(0.33)}
            >
              1/3
            </button>
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet(0.5)}
            >
              1/2
            </button>
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet(0.75)}
            >
              3/4
            </button>
            <button 
              className="betting-controls__quick-btn"
              onClick={() => handleQuickBet('pot')}
            >
              Pot
            </button>
            <button 
              className="betting-controls__quick-btn betting-controls__quick-btn--allin"
              onClick={() => handleQuickBet('allin')}
            >
              All-In
            </button>
          </div>
          
          <div className="betting-controls__slider-actions">
            <button 
              className="betting-controls__btn betting-controls__btn--cancel"
              onClick={handleCancelBet}
            >
              Cancel
            </button>
            <button 
              className="betting-controls__btn betting-controls__btn--confirm"
              onClick={handleBetOrRaise}
            >
              {canBet ? 'Bet' : 'Raise'} ${betAmount}
            </button>
          </div>
        </div>
      ) : (
        // Main action buttons
        <div className="betting-controls__actions">
          {canFold && (
            <button 
              className="betting-controls__btn betting-controls__btn--fold"
              onClick={handleFold}
            >
              Fold
            </button>
          )}
          
          {canCheck && (
            <button 
              className="betting-controls__btn betting-controls__btn--check"
              onClick={handleCheck}
            >
              Check
            </button>
          )}
          
          {canCall && (
            <button 
              className="betting-controls__btn betting-controls__btn--call"
              onClick={handleCall}
            >
              Call ${toCall}
            </button>
          )}
          
          {(canBet || canRaise) && (
            <button 
              className="betting-controls__btn betting-controls__btn--raise"
              onClick={handleBetOrRaise}
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
