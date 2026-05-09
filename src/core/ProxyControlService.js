/**
 * File: src/core/ProxyControlService.js
 * Description: Background service to maintain browser sessions and health.
 * Enhanced to support multiple browser instances and smarter health checks.
 */
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

class ProxyControlService {
    constructor(serverSystem, logger) {
        this.serverSystem = serverSystem;
        this.logger = logger;
        this.maintenanceTimer = null;
        this.autoLaunchEnabled = process.env.AUTO_LAUNCH_BROWSER === 'true';
        this.browserPath = process.env.BROWSER_PATH || null;
        this.lastLaunchTime = 0;
        this.launchCooldown = 30000; // 30 seconds cooldown to prevent launch loops
    }

    start() {
        this.logger.info('[Control] Starting Proxy Control Service...');
        // Every 1 minute check session health for faster recovery during testing
        this.maintenanceTimer = setInterval(() => this.checkHealth(), 60000);
        
        if (this.autoLaunchEnabled) {
            this.logger.info('[Control] Auto-launch is enabled.');
            // Don't launch immediately on start to give manual sessions a chance to connect
            setTimeout(() => this.checkHealth(), 5000);
        }
    }

    async checkHealth() {
        const registry = this.serverSystem.sessionRegistry;
        const sessions = registry.getConnections();
        
        // Find sessions that are actually ready to work
        const activeSessions = sessions.filter(s => s.authenticated && s.ws && s.ws.readyState === 1);
        
        if (activeSessions.length === 0) {
            const now = Date.now();
            // Also check for pending unauthenticated connections to avoid double-launching
            const pendingConnections = sessions.filter(s => !s.authenticated && s.ws && s.ws.readyState === 1);
            
            if (pendingConnections.length > 0) {
                this.logger.info(`[Control] Waiting for ${pendingConnections.length} pending session(s) to authenticate...`);
                return;
            }

            this.logger.warn('[Control] No active browser sessions detected!');
            if (this.autoLaunchEnabled && (now - this.lastLaunchTime > this.launchCooldown)) {
                await this.launchBrowser();
                this.lastLaunchTime = now;
            }
        } else {
            this.logger.debug(`[Control] Heartbeat OK. Active sessions: ${activeSessions.length}`);
        }
    }

    async launchBrowser() {
        this.logger.info('[Control] Attempting to auto-launch browser for Gemini session...');
        
        // Use the local server address
        const port = this.serverSystem.config.httpPort || 7861;
        const targetUrl = `http://127.0.0.1:${port}`;
        
        let command = '';
        const platform = os.platform();

        if (this.browserPath) {
            command = `"${this.browserPath}" "${targetUrl}"`;
        } else {
            if (platform === 'win32') {
                command = `start "" "${targetUrl}"`;
            } else if (platform === 'darwin') {
                command = `open "${targetUrl}"`;
            } else {
                command = `xdg-open "${targetUrl}"`;
            }
        }

        this.logger.info(`[Control] Executing: ${command}`);
        exec(command, (error) => {
            if (error) {
                this.logger.error(`[Control] Failed to launch browser: ${error.message}`);
            } else {
                this.logger.info('[Control] Browser launch command sent successfully.');
            }
        });
    }

    stop() {
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }
    }
}

module.exports = ProxyControlService;
