/**
 * ChipStack Component
 * Visual representation of poker chips
 */

import './ChipStack.css';

/**
 * ChipStack - Renders a pixel-art chip stack icon
 * @param {Object} props
 * @param {number} props.amount - The bankroll amount to determine stack size
 * @param {string} props.size - 'small' | 'medium' | 'large'
 */
function ChipStack({ amount = 1000, size = 'medium' }) {
  // Determine number of chips to show based on amount
  const getChipCount = () => {
    if (amount >= 10000) return 4;
    if (amount >= 5000) return 3;
    if (amount >= 1000) return 2;
    return 1;
  };

  const chipCount = getChipCount();
  const chips = Array.from({ length: chipCount }, (_, i) => i);

  // Assign chip colors based on position
  const chipColors = ['red', 'blue', 'green', 'black'];

  return (
    <div className={`chip-stack chip-stack--${size}`}>
      {chips.map((_, index) => (
        <div 
          key={index}
          className={`chip chip--${chipColors[index % chipColors.length]}`}
          style={{ 
            bottom: `${index * 4}px`,
            zIndex: chipCount - index 
          }}
        />
      ))}
    </div>
  );
}

export default ChipStack;
