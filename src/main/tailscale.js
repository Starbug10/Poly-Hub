const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Check if Tailscale is installed and running
 * @returns {Promise<{installed: boolean, running: boolean, loggedIn: boolean}>}
 */
async function getTailscaleStatus() {
  try {
    // Try to run tailscale status command
    const { stdout } = await execAsync('tailscale status --json');
    const status = JSON.parse(stdout);
    
    return {
      installed: true,
      running: true,
      loggedIn: status.BackendState === 'Running',
    };
  } catch (error) {
    // Check if tailscale command exists
    try {
      await execAsync('where tailscale');
      return {
        installed: true,
        running: false,
        loggedIn: false,
      };
    } catch {
      return {
        installed: false,
        running: false,
        loggedIn: false,
      };
    }
  }
}

/**
 * Get the user's Tailscale IP (100.x.x.x)
 * @returns {Promise<string|null>}
 */
async function getTailscaleIP() {
  try {
    const { stdout } = await execAsync('tailscale ip -4');
    const ip = stdout.trim();
    
    // Validate it's a Tailscale IP (100.x.x.x range)
    if (ip.startsWith('100.')) {
      return ip;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  getTailscaleStatus,
  getTailscaleIP,
};
