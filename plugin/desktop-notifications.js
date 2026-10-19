// desktop-notifications.js — Desktop notification plugin for Kilo CLI
// Fires Windows toast notifications (like Chrome browser) when Kilo finishes a task.
// Listens for session.idle events which fire when Kilo completes a response.

const { exec } = require('child_process');

/**
 * Fire a Windows 10/11 toast notification via BurntToast
 * Falls back to console beep if BurntToast is not available
 */
function toastNotification(message, title) {
  // PowerShell command to show toast notification
  const psCommand = `
    try {
      Import-Module BurntToast -ErrorAction Stop
      New-BurntToastNotification -Text "${title}", "${message}" -Sound "Default" -AppLogo "C:\\Windows\\System32\\cmd.exe"
    } catch {
      # Fallback: beep + console message
      [console]::beep(800, 300); [console]::beep(1000, 300)
      Write-Host "[${title}] ${message}"
    }
  `;

  exec(`powershell -NoProfile -WindowStyle Hidden -Command "${psCommand}"`, (error) => {
    if (error) {
      // Silent fail - notification is best-effort
    }
  });
}

/**
 * Fire a simple console beep (always works)
 */
function beepNotification() {
  exec('powershell -NoProfile -Command "[console]::beep(800, 300); [console]::beep(1000, 300)"', (error) => {
    if (error) {
      console.log('[Kilo CLI] Tarefa concluída!');
    }
  });
}

const DesktopNotifications = async () => ({
  event: async ({ event }) => {
    if (event.type === 'session.idle') {
      // session.idle fires when the session finished responding
      // This is the perfect moment to notify the user
      const sessionId = event.data?.sessionID || 'unknown';
      const message = 'Tarefa concluída! CLI pronto para próxima instrução.';
      
      toastNotification(message, 'Kilo CLI');
    }
    
    if (event.type === 'session.error') {
      const error = event.data?.error || 'Erro desconhecido';
      toastNotification(`Erro: ${error}`, 'Kilo CLI - Erro');
    }
  },
});

module.exports = { 
  id: 'desktop-notifications', 
  server: DesktopNotifications 
};
