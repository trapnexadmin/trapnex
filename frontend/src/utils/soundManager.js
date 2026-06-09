/**
 * Sound Manager
 * Handles audio notifications for trading events
 */

class SoundManager {
  constructor() {
    this.sounds = {
      signal: new Audio('/assets/sound/signal.mp3'),
      target: new Audio('/assets/sound/target.mp3'),
      stoploss: new Audio('/assets/sound/stoploss.mp3'),
    };

    // Preload all sounds
    Object.values(this.sounds).forEach(sound => {
      sound.preload = 'auto';
      sound.volume = 0.6; // Default volume at 60%
    });

    this.enabled = this.loadPreference();
  }

  /**
   * Load sound preference from localStorage
   */
  loadPreference() {
    try {
      const saved = localStorage.getItem('trapnex_sounds_enabled');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  }

  /**
   * Save sound preference to localStorage
   */
  savePreference(enabled) {
    try {
      localStorage.setItem('trapnex_sounds_enabled', enabled.toString());
      this.enabled = enabled;
    } catch (err) {
      console.error('[Sound] Failed to save preference:', err);
    }
  }

  /**
   * Toggle sound on/off
   */
  toggle() {
    this.enabled = !this.enabled;
    this.savePreference(this.enabled);
    return this.enabled;
  }

  /**
   * Play signal sound when new trade signal is generated
   */
  playSignal() {
    this.play('signal');
  }

  /**
   * Play target sound when trade hits target
   */
  playTarget() {
    this.play('target');
  }

  /**
   * Play stop loss sound when trade hits stop loss
   */
  playStopLoss() {
    this.play('stoploss');
  }

  /**
   * Internal play method
   */
  play(soundName) {
    if (!this.enabled) return;

    const sound = this.sounds[soundName];
    if (!sound) {
      console.error(`[Sound] Unknown sound: ${soundName}`);
      return;
    }

    try {
      // Reset and play
      sound.currentTime = 0;
      const playPromise = sound.play();

      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Autoplay policy might block the sound
          console.warn(`[Sound] Playback prevented:`, err.message);
        });
      }
    } catch (err) {
      console.error(`[Sound] Error playing ${soundName}:`, err.message);
    }
  }

  /**
   * Set volume for all sounds (0.0 to 1.0)
   */
  setVolume(volume) {
    const vol = Math.max(0, Math.min(1, volume));
    Object.values(this.sounds).forEach(sound => {
      sound.volume = vol;
    });
  }

  /**
   * Check if sounds are enabled
   */
  isEnabled() {
    return this.enabled;
  }
}

// Create singleton instance
const soundManager = new SoundManager();

export default soundManager;
