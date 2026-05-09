/**
 * File: src/core/ProxyControlService.js
 * Description: Background service to maintain browser sessions and health.
 * Now includes browser auto-launch capabilities.
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
    }

    start() {
        this.logger.info('[Control] Starting Proxy Control Service...');
        // Every 2 minutes check session health
        this.maintenanceTimer = setInterval(() => this.checkHealth(), 120000);
        
        if (this.autoLaunchEnabled) {
            this.logger.info('[Control] Auto-launch is enabled.');
            this.checkHealth(); // Initial check
        }
    }

    async checkHealth() {
        const registry = this.serverSystem.sessionRegistry;
        const sessions = registry.getConnections();
        const activeSessions = sessions.filter(s => s.authenticated && s.readyState === 1);
        
        if (activeSessions.length === 0) {
            this.logger.warn('[Control] No active browser sessions detected!');
            if (this.autoLaunchEnabled) {
                await this.launchBrowser();
            }
        } else {
            this.logger.debug(`[Control] Heartbeat OK. Active sessions: ${activeSessions.length}`);
        }
    }

    async launchBrowser() {
        this.logger.info('[Control] Attempting to auto-launch browser for Gemini session...');
        
        // We use the local server address. Assuming it's on localhost for auto-launch scenario.
        const port = this.serverSystem.config.httpPort || 7861;
        const targetUrl = `http://127.0.0.1:${port}`;
        
        let command = '';
        const platform = os.platform();

        if (this.browserPath) {
            command = `"${this.browserPath}" "${targetUrl}"`;
        } else {
            // Default browser commands
            if (platform === 'win32') {
                command = `start "" "${targetUrl}"`;
            } else if (platform === 'darwin') {
                command = `open "${targetUrl}"`;
            } else {
                command = `xdg-open "${targetUrl}"`;
            }
        }

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
