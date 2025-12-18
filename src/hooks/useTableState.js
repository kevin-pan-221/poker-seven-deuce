/**
 * useTableState Hook
 * Manages the poker table state including seats and players
 */

import { useState, useCallback } from 'react';

// Mock player data for initial state
const MOCK_PLAYERS = [
  { id: 1, username: 'AceHigh', bankroll: 5000 },
  { id: 2, username: 'BluffMaster', bankroll: 12500 },
  { id: 3, username: 'ChipLeader', bankroll: 8750 },
  { id: 4, username: 'RiverRat', bankroll: 3200 },
];

/**
 * useTableState - Custom hook for managing table state
 * @param {Object} options
 * @param {number} options.maxSeats - Maximum number of seats (default 8)
 * @param {boolean} options.useMockData - Whether to use mock data initially
 * @returns {Object} Table state and actions
 */
function useTableState({ maxSeats = 8, useMockData = true } = {}) {
  // Initialize seats array with mock data or empty
  const initialSeats = () => {
    const seats = Array(maxSeats).fill(null);
    if (useMockData) {
      // Place mock players at various seats
      seats[1] = MOCK_PLAYERS[0];
      seats[3] = MOCK_PLAYERS[1];
      seats[5] = MOCK_PLAYERS[2];
      seats[6] = MOCK_PLAYERS[3];
    }
    return seats;
  };

  const [seats, setSeats] = useState(initialSeats);
  const [localPlayerSeat, setLocalPlayerSeat] = useState(null);
  const [localPlayer, setLocalPlayer] = useState(null);

  /**
   * Take a seat at the table
   * @param {number} seatIndex - The seat index to take
   * @param {string} username - The player's username
   * @param {number} buyIn - Initial bankroll
   */
  const takeSeat = useCallback((seatIndex, username = 'You', buyIn = 1000) => {
    if (seats[seatIndex] !== null) {
      console.warn('Seat is already taken');
      return false;
    }

    if (localPlayerSeat !== null) {
      console.warn('Already seated at another position');
      return false;
    }

    const newPlayer = {
      id: Date.now(),
      username,
      bankroll: buyIn,
      isLocal: true,
    };

    setSeats(prev => {
      const newSeats = [...prev];
      newSeats[seatIndex] = newPlayer;
      return newSeats;
    });
    
    setLocalPlayerSeat(seatIndex);
    setLocalPlayer(newPlayer);
    
    return true;
  }, [seats, localPlayerSeat]);

  /**
   * Leave the current seat
   */
  const leaveSeat = useCallback(() => {
    if (localPlayerSeat === null) {
      console.warn('Not seated');
      return false;
    }

    setSeats(prev => {
      const newSeats = [...prev];
      newSeats[localPlayerSeat] = null;
      return newSeats;
    });
    
    setLocalPlayerSeat(null);
    setLocalPlayer(null);
    
    return true;
  }, [localPlayerSeat]);

  /**
   * Update a player's bankroll
   * @param {number} seatIndex - The seat index
   * @param {number} amount - Amount to add (negative to subtract)
   */
  const updateBankroll = useCallback((seatIndex, amount) => {
    setSeats(prev => {
      const newSeats = [...prev];
      if (newSeats[seatIndex]) {
        newSeats[seatIndex] = {
          ...newSeats[seatIndex],
          bankroll: Math.max(0, newSeats[seatIndex].bankroll + amount),
        };
      }
      return newSeats;
    });

    // Update local player if it's their bankroll
    if (seatIndex === localPlayerSeat) {
      setLocalPlayer(prev => ({
        ...prev,
        bankroll: Math.max(0, prev.bankroll + amount),
      }));
    }
  }, [localPlayerSeat]);

  /**
   * Get count of occupied seats
   */
  const getPlayerCount = useCallback(() => {
    return seats.filter(s => s !== null).length;
  }, [seats]);

  /**
   * Check if table is full
   */
  const isTableFull = useCallback(() => {
    return getPlayerCount() >= maxSeats;
  }, [getPlayerCount, maxSeats]);

  return {
    // State
    seats,
    localPlayerSeat,
    localPlayer,
    maxSeats,
    
    // Actions
    takeSeat,
    leaveSeat,
    updateBankroll,
    
    // Computed
    getPlayerCount,
    isTableFull,
    isSeated: localPlayerSeat !== null,
  };
}

export default useTableState;
