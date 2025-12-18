/**
 * Poker Hand Evaluator
 * Evaluates the best 5-card hand from 7 cards (2 hole + 5 community)
 */

// Hand rankings (higher is better)
export const HAND_RANKS = {
  HIGH_CARD: 1,
  PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

// Hand names for display
export const HAND_NAMES = {
  1: 'High Card',
  2: 'Pair',
  3: 'Two Pair',
  4: 'Three of a Kind',
  5: 'Straight',
  6: 'Flush',
  7: 'Full House',
  8: 'Four of a Kind',
  9: 'Straight Flush',
  10: 'Royal Flush'
};

// Card rank values (2=2, ..., A=14)
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace'
};

/**
 * Get numeric value of a card rank
 */
function getRankValue(rank) {
  return RANK_VALUES[rank] || 0;
}

/**
 * Get all 5-card combinations from an array of cards
 */
function getCombinations(cards, size = 5) {
  const result = [];
  
  function combine(start, combo) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      combo.push(cards[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  
  combine(0, []);
  return result;
}

/**
 * Check if cards form a flush (all same suit)
 */
function isFlush(cards) {
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

/**
 * Check if cards form a straight
 * Returns the high card value if straight, 0 otherwise
 */
function getStraightHighCard(cards) {
  const values = cards.map(c => getRankValue(c.rank)).sort((a, b) => b - a);
  
  // Check for regular straight
  let isSequential = true;
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) {
      isSequential = false;
      break;
    }
  }
  if (isSequential) return values[0];
  
  // Check for wheel (A-2-3-4-5)
  const wheel = [14, 5, 4, 3, 2];
  if (values.every((v, i) => v === wheel[i])) {
    return 5; // 5-high straight
  }
  
  return 0;
}

/**
 * Count occurrences of each rank
 */
function getRankCounts(cards) {
  const counts = {};
  for (const card of cards) {
    const value = getRankValue(card.rank);
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

/**
 * Evaluate a 5-card hand
 * Returns { rank, highCards, description }
 */
function evaluateFiveCards(cards) {
  const flush = isFlush(cards);
  const straightHigh = getStraightHighCard(cards);
  const counts = getRankCounts(cards);
  
  const countValues = Object.entries(counts)
    .map(([rank, count]) => ({ rank: parseInt(rank), count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });
  
  const highCards = countValues.map(c => c.rank);
  
  // Royal Flush
  if (flush && straightHigh === 14) {
    return {
      rank: HAND_RANKS.ROYAL_FLUSH,
      highCards: [14],
      description: 'Royal Flush'
    };
  }
  
  // Straight Flush
  if (flush && straightHigh > 0) {
    return {
      rank: HAND_RANKS.STRAIGHT_FLUSH,
      highCards: [straightHigh],
      description: `Straight Flush, ${RANK_NAMES[straightHigh]} high`
    };
  }
  
  // Four of a Kind
  if (countValues[0].count === 4) {
    return {
      rank: HAND_RANKS.FOUR_OF_A_KIND,
      highCards,
      description: `Four ${RANK_NAMES[countValues[0].rank]}s`
    };
  }
  
  // Full House
  if (countValues[0].count === 3 && countValues[1].count === 2) {
    return {
      rank: HAND_RANKS.FULL_HOUSE,
      highCards,
      description: `Full House, ${RANK_NAMES[countValues[0].rank]}s over ${RANK_NAMES[countValues[1].rank]}s`
    };
  }
  
  // Flush
  if (flush) {
    return {
      rank: HAND_RANKS.FLUSH,
      highCards,
      description: `Flush, ${RANK_NAMES[highCards[0]]} high`
    };
  }
  
  // Straight
  if (straightHigh > 0) {
    return {
      rank: HAND_RANKS.STRAIGHT,
      highCards: [straightHigh],
      description: `Straight, ${RANK_NAMES[straightHigh]} high`
    };
  }
  
  // Three of a Kind
  if (countValues[0].count === 3) {
    return {
      rank: HAND_RANKS.THREE_OF_A_KIND,
      highCards,
      description: `Three ${RANK_NAMES[countValues[0].rank]}s`
    };
  }
  
  // Two Pair
  if (countValues[0].count === 2 && countValues[1].count === 2) {
    const highPair = Math.max(countValues[0].rank, countValues[1].rank);
    const lowPair = Math.min(countValues[0].rank, countValues[1].rank);
    return {
      rank: HAND_RANKS.TWO_PAIR,
      highCards: [highPair, lowPair, countValues[2].rank],
      description: `Two Pair, ${RANK_NAMES[highPair]}s and ${RANK_NAMES[lowPair]}s`
    };
  }
  
  // Pair
  if (countValues[0].count === 2) {
    return {
      rank: HAND_RANKS.PAIR,
      highCards,
      description: `Pair of ${RANK_NAMES[countValues[0].rank]}s`
    };
  }
  
  // High Card
  return {
    rank: HAND_RANKS.HIGH_CARD,
    highCards,
    description: `${RANK_NAMES[highCards[0]]} high`
  };
}

/**
 * Compare two hands
 * Returns positive if hand1 wins, negative if hand2 wins, 0 for tie
 */
export function compareHands(hand1, hand2) {
  if (hand1.rank !== hand2.rank) {
    return hand1.rank - hand2.rank;
  }
  
  // Same rank - compare high cards
  for (let i = 0; i < Math.min(hand1.highCards.length, hand2.highCards.length); i++) {
    if (hand1.highCards[i] !== hand2.highCards[i]) {
      return hand1.highCards[i] - hand2.highCards[i];
    }
  }
  
  return 0; // Tie
}

/**
 * Evaluate the best 5-card hand from up to 7 cards
 * @param {Array} holeCards - Player's 2 hole cards
 * @param {Array} communityCards - Community cards (0-5)
 * @returns {Object} Best hand evaluation { rank, highCards, description, cards }
 */
export function evaluateHand(holeCards, communityCards = []) {
  const allCards = [...holeCards, ...communityCards];
  
  // Need at least 2 cards to evaluate
  if (allCards.length < 2) {
    return null;
  }
  
  // If less than 5 cards, evaluate what we have
  if (allCards.length < 5) {
    // For fewer than 5 cards, just show best current hand
    const counts = getRankCounts(allCards);
    const countValues = Object.entries(counts)
      .map(([rank, count]) => ({ rank: parseInt(rank), count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.rank - a.rank;
      });
    
    const highCards = countValues.map(c => c.rank);
    
    // Check for pairs, etc. with what we have
    if (countValues[0].count === 4) {
      return {
        rank: HAND_RANKS.FOUR_OF_A_KIND,
        highCards,
        description: `Four ${RANK_NAMES[countValues[0].rank]}s`,
        cards: allCards
      };
    }
    if (countValues[0].count === 3 && countValues.length > 1 && countValues[1].count === 2) {
      return {
        rank: HAND_RANKS.FULL_HOUSE,
        highCards,
        description: `Full House, ${RANK_NAMES[countValues[0].rank]}s over ${RANK_NAMES[countValues[1].rank]}s`,
        cards: allCards
      };
    }
    if (countValues[0].count === 3) {
      return {
        rank: HAND_RANKS.THREE_OF_A_KIND,
        highCards,
        description: `Three ${RANK_NAMES[countValues[0].rank]}s`,
        cards: allCards
      };
    }
    if (countValues[0].count === 2 && countValues.length > 1 && countValues[1].count === 2) {
      const highPair = Math.max(countValues[0].rank, countValues[1].rank);
      const lowPair = Math.min(countValues[0].rank, countValues[1].rank);
      return {
        rank: HAND_RANKS.TWO_PAIR,
        highCards: [highPair, lowPair],
        description: `Two Pair, ${RANK_NAMES[highPair]}s and ${RANK_NAMES[lowPair]}s`,
        cards: allCards
      };
    }
    if (countValues[0].count === 2) {
      return {
        rank: HAND_RANKS.PAIR,
        highCards,
        description: `Pair of ${RANK_NAMES[countValues[0].rank]}s`,
        cards: allCards
      };
    }
    
    return {
      rank: HAND_RANKS.HIGH_CARD,
      highCards,
      description: `${RANK_NAMES[highCards[0]]} high`,
      cards: allCards
    };
  }
  
  // Get all 5-card combinations and find the best
  const combinations = getCombinations(allCards, 5);
  let bestHand = null;
  let bestCards = null;
  
  for (const combo of combinations) {
    const hand = evaluateFiveCards(combo);
    if (!bestHand || compareHands(hand, bestHand) > 0) {
      bestHand = hand;
      bestCards = combo;
    }
  }
  
  return {
    ...bestHand,
    cards: bestCards
  };
}

/**
 * Get a simple hand description for display
 */
export function getHandDescription(holeCards, communityCards = []) {
  const result = evaluateHand(holeCards, communityCards);
  if (!result) return '';
  return result.description;
}
