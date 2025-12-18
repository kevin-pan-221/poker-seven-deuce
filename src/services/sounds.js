/**
 * Sound service for game audio effects
 * Uses Web Audio API for low-latency playback
 */

class SoundService {
  constructor() {
    this.audioContext = null;
    this.sounds = {};
    this.enabled = true;
    this.volume = 0.5;
    
    // Initialize on first user interaction
    this.initialized = false;
  }

  /**
   * Initialize the audio context (must be called after user interaction)
   */
  init() {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
      console.log('Sound service initialized');
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  /**
   * Generate a simple synth sound (8-bit style)
   */
  playTone(frequency, duration, type = 'square', volumeMod = 1) {
    if (!this.enabled || !this.audioContext) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      
      // Volume envelope
      const vol = this.volume * volumeMod;
      gainNode.gain.setValueAtTime(vol, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      console.warn('Error playing sound:', e);
    }
  }

  /**
   * Play a sequence of tones
   */
  playSequence(notes, baseDelay = 0.08) {
    notes.forEach((note, i) => {
      setTimeout(() => {
        this.playTone(note.freq, note.duration || 0.1, note.type || 'square', note.vol || 1);
      }, i * baseDelay * 1000);
    });
  }

  /**
   * Card dealt to player (personal cards)
   */
  cardDealt() {
    this.init();
    // Quick swoosh + thud
    this.playSequence([
      { freq: 800, duration: 0.05, type: 'sawtooth', vol: 0.3 },
      { freq: 200, duration: 0.08, type: 'square', vol: 0.5 },
    ], 0.03);
  }

  /**
   * Community card dealt (flop, turn, river)
   */
  communityCard() {
    this.init();
    // Slightly different sound for board cards
    this.playSequence([
      { freq: 600, duration: 0.04, type: 'sawtooth', vol: 0.3 },
      { freq: 300, duration: 0.1, type: 'triangle', vol: 0.4 },
    ], 0.04);
  }

  /**
   * Flop dealt (3 cards)
   */
  flopDealt() {
    this.init();
    this.playSequence([
      { freq: 500, duration: 0.06, type: 'square', vol: 0.4 },
      { freq: 550, duration: 0.06, type: 'square', vol: 0.4 },
      { freq: 600, duration: 0.08, type: 'square', vol: 0.5 },
    ], 0.12);
  }

  /**
   * Check action
   */
  check() {
    this.init();
    // Double tap sound
    this.playSequence([
      { freq: 800, duration: 0.04, type: 'square', vol: 0.3 },
      { freq: 800, duration: 0.04, type: 'square', vol: 0.3 },
    ], 0.08);
  }

  /**
   * Call action
   */
  call() {
    this.init();
    // Chip sound
    this.playSequence([
      { freq: 1200, duration: 0.05, type: 'square', vol: 0.3 },
      { freq: 900, duration: 0.08, type: 'triangle', vol: 0.4 },
    ], 0.05);
  }

  /**
   * Bet/Raise action
   */
  bet() {
    this.init();
    // More dramatic chip sound
    this.playSequence([
      { freq: 1000, duration: 0.04, type: 'sawtooth', vol: 0.3 },
      { freq: 1400, duration: 0.06, type: 'square', vol: 0.4 },
      { freq: 800, duration: 0.1, type: 'triangle', vol: 0.3 },
    ], 0.06);
  }

  /**
   * Fold action
   */
  fold() {
    this.init();
    // Sad descending tone
    this.playSequence([
      { freq: 400, duration: 0.1, type: 'triangle', vol: 0.3 },
      { freq: 300, duration: 0.15, type: 'triangle', vol: 0.25 },
    ], 0.1);
  }

  /**
   * All-in action
   */
  allIn() {
    this.init();
    // Dramatic ascending
    this.playSequence([
      { freq: 400, duration: 0.08, type: 'square', vol: 0.4 },
      { freq: 600, duration: 0.08, type: 'square', vol: 0.45 },
      { freq: 800, duration: 0.08, type: 'square', vol: 0.5 },
      { freq: 1000, duration: 0.15, type: 'sawtooth', vol: 0.5 },
    ], 0.1);
  }

  /**
   * Win pot
   */
  win() {
    this.init();
    // Victory fanfare
    this.playSequence([
      { freq: 523, duration: 0.1, type: 'square', vol: 0.4 },  // C
      { freq: 659, duration: 0.1, type: 'square', vol: 0.4 },  // E
      { freq: 784, duration: 0.1, type: 'square', vol: 0.45 }, // G
      { freq: 1047, duration: 0.2, type: 'square', vol: 0.5 }, // C high
    ], 0.12);
  }

  /**
   * Your turn notification
   */
  yourTurn() {
    this.init();
    // Alert chime
    this.playSequence([
      { freq: 880, duration: 0.1, type: 'sine', vol: 0.4 },
      { freq: 1100, duration: 0.15, type: 'sine', vol: 0.5 },
    ], 0.15);
  }

  /**
   * New hand starting
   */
  newHand() {
    this.init();
    // Shuffle/new hand sound
    this.playSequence([
      { freq: 200, duration: 0.05, type: 'sawtooth', vol: 0.2 },
      { freq: 250, duration: 0.05, type: 'sawtooth', vol: 0.25 },
      { freq: 300, duration: 0.05, type: 'sawtooth', vol: 0.3 },
      { freq: 400, duration: 0.1, type: 'square', vol: 0.35 },
    ], 0.05);
  }

  /**
   * Button click
   */
  click() {
    this.init();
    this.playTone(600, 0.05, 'square', 0.2);
  }

  /**
   * Error/invalid action
   */
  error() {
    this.init();
    this.playSequence([
      { freq: 200, duration: 0.1, type: 'square', vol: 0.3 },
      { freq: 150, duration: 0.15, type: 'square', vol: 0.3 },
    ], 0.1);
  }

  /**
   * Toggle sound on/off
   */
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.click();
    }
    return this.enabled;
  }

  /**
   * Set volume (0-1)
   */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
  }
}

// Singleton instance
const soundService = new SoundService();
export default soundService;
