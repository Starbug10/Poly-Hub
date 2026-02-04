const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Check if Tailscale is installed and running
 * @returns {Promise<{installed: boolean, running: boolean, loggedIn: boolean, ip: string|null}>}
 */
async function getTailscaleStatus() {
  try {
    // First check if we can get an IP - this is the most reliable way to know Tailscale is working
    const ip = await getTailscaleIP();
    
    if (!ip) {
      // No IP means Tailscale isn't connected even if daemon is running
      try {
        await execAsync('where tailscale');
        return {
          installed: true,
          running: false,
          loggedIn: false,
          ip: null,
        };
      } catch {
        return {
          installed: false,
          running: false,
          loggedIn: false,
          ip: null,
        };
      }
    }
    
    // We have an IP, now check the status for more details
    try {
      const { stdout } = await execAsync('tailscale status --json');
      const status = JSON.parse(stdout);
      
      return {
        installed: true,
        running: status.BackendState === 'Running',
        loggedIn: status.BackendState === 'Running',
        ip: ip,
      };
    } catch {
      // We have IP but status check failed - still consider it running
      return {
        installed: true,
        running: true,
        loggedIn: true,
        ip: ip,
      };
    }
  } catch (error) {
    // Complete failure - check if tailscale is even installed
    try {
      await execAsync('where tailscale');
      return {
        installed: true,
        running: false,
        loggedIn: false,
        ip: null,
      };
    } catch {
      return {
        installed: false,
        running: false,
        loggedIn: false,
        ip: null,
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
