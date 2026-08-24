import * as vscode from 'vscode';
import { execFile } from 'child_process';

/**
 * Native completion notifications.
 *
 * Fired on `agent_settled` (pi has fully settled: no automatic retry,
 * compaction retry, or queued continuation remains) so the user knows the
 * task is done even when the sidebar is hidden or the window is unfocused.
 */

export function notifyConfig(): { enabled: boolean; sound: boolean } {
  const cfg = vscode.workspace.getConfiguration('piChat');
  return {
    enabled: cfg.get<boolean>('notifyOnComplete', true),
    sound: cfg.get<boolean>('notifySound', false),
  };
}

/** True when the user is likely looking elsewhere (window unfocused or view hidden). */
export function shouldNotify(view: vscode.WebviewView | undefined): boolean {
  if (!vscode.window.state.focused) return true; // different app entirely
  return !view?.visible; // same window but chat sidebar not shown
}

export async function notifyTaskComplete(view: vscode.WebviewView | undefined, pendingEdits: number): Promise<void> {
  const { enabled, sound } = notifyConfig();
  if (!enabled) return;
  if (!shouldNotify(view)) return;

  const detail = pendingEdits > 0 ? ` — ${pendingEdits} pending edit${pendingEdits > 1 ? 's' : ''}` : '';
  const pick = await vscode.window.showInformationMessage(`Pi: task finished${detail}`, 'Open Pi Chat');
  if (pick === 'Open Pi Chat') {
    await vscode.commands.executeCommand('workbench.view.extension.pi-chat');
  }

  if (sound) {
    playChime();
  }
}

/**
 * Best-effort cross-platform chime. Fire-and-forget; failures are silent.
 * - macOS: afplay system sound
 * - Linux: canberra-gtk-play, falling back to paplay (freedesktop sounds)
 * - Windows: PowerShell console beep
 */
function playChime(): void {
  try {
    if (process.platform === 'darwin') {
      execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
    } else if (process.platform === 'linux') {
      execFile('canberra-gtk-play', ['-i', 'complete'], (err) => {
        if (err) execFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'], () => {});
      });
    } else if (process.platform === 'win32') {
      execFile('powershell.exe', ['-NoProfile', '-Command', '[console]::beep(1000,250)'], () => {});
    }
  } catch {
    /* sound is best-effort */
  }
}
