import * as vscode from 'vscode';
import { execFile } from 'child_process';

/**
 * Completion notifications.
 *
 * Fired on `agent_settled` (pi has fully settled: no automatic retry,
 * compaction retry, or queued continuation remains) so the user knows the
 * task is done even when the sidebar is hidden or the window is unfocused.
 *
 * Two channels:
 * - VS Code toast (showInformationMessage) with an "Open Pi Chat" action
 * - Optional OS-level desktop notification (notify-send / osascript /
 *   PowerShell toast) so the alert is visible even when VS Code is not
 */

interface NotifyOptions {
  enabled: boolean;
  always: boolean;
  desktop: boolean;
}

export function notifyConfig(): NotifyOptions {
  const cfg = vscode.workspace.getConfiguration('piChat');
  return {
    enabled: cfg.get<boolean>('notifyOnComplete', true),
    always: cfg.get<boolean>('notifyAlways', false),
    desktop: cfg.get<boolean>('notifyDesktop', false),
  };
}

/** True when the user is likely looking elsewhere — unless notifyAlways is on. */
export function shouldNotify(view: vscode.WebviewView | undefined, always: boolean): boolean {
  if (always) return true;
  if (!vscode.window.state.focused) return true; // different app entirely
  return !view?.visible; // same window but chat sidebar not shown
}

/**
 * Best-effort OS-level desktop notification. Fire-and-forget; failures are silent.
 * - Linux: notify-send
 * - macOS: osascript display notification
 * - Windows: PowerShell toast
 */
function sendDesktopNotification(title: string, body: string): void {
  try {
    if (process.platform === 'linux') {
      execFile('notify-send', ['-a', title, title, body], () => {});
    } else if (process.platform === 'darwin') {
      execFile('osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], () => {});
    } else if (process.platform === 'win32') {
      // BurntToast-free fallback: plain text toast via WinRT, no escaping support
      const ps = `$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]; $x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $x.GetElementsByTagName('text')[0].AppendChild($x.CreateTextNode('${title}'))>$null; $x.GetElementsByTagName('text')[1].AppendChild($x.CreateTextNode('${body}'))>$null; [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${title}').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
      execFile('powershell.exe', ['-NoProfile', '-Command', ps], () => {});
    }
  } catch {
    /* desktop notification is best-effort */
  }
}

export async function notifyTaskComplete(view: vscode.WebviewView | undefined, pendingEdits: number): Promise<void> {
  const { enabled, always, desktop } = notifyConfig();
  if (!enabled) return;
  if (!shouldNotify(view, always)) return;

  const detail = pendingEdits > 0 ? ` — ${pendingEdits} pending edit${pendingEdits > 1 ? 's' : ''}` : '';
  const message = `Pi: task finished${detail}`;

  if (desktop) {
    sendDesktopNotification('Pi Chat', message);
  }

  const pick = await vscode.window.showInformationMessage(message, 'Open Pi Chat');
  if (pick === 'Open Pi Chat') {
    await vscode.commands.executeCommand('workbench.view.extension.pi-chat');
  }
}
