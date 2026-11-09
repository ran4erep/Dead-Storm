export const rollDice = (diceNotation: string): number => {
  // Format: "2d6", "1d8+2", "10"
  if (!diceNotation) return 0;
  
  const cleanNotation = diceNotation.toLowerCase().replace(/\s/g, '');
  
  // Check if it's just a number
  if (/^\d+$/.test(cleanNotation)) {
    return parseInt(cleanNotation, 10);
  }

  // Parse XdY(+Z)
  const match = cleanNotation.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  
  if (!match) {
    console.warn(`Invalid dice notation: ${diceNotation}`);
    return 1; // Fallback
  }

  const numDice = parseInt(match[1], 10);
  const numSides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * numSides) + 1;
  }

  return total + modifier;
};

export const getAverageDamage = (diceNotation: string): string => {
    return diceNotation; // Just display the dice string for UI
};