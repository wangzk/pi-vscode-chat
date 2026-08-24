import * as vscode from 'vscode';

/**
 * Native completion notifications.
 *
 * Fired on `agent_settled` (pi has fully settled: no automatic retry,
 * compaction retry, or queued continuation remains) so the user knows the
 * task is done even when the sidebar is hidden or the window is unfocused.
 */

export function notifyConfig(): { enabled: boolean } {
  const cfg = vscode.workspace.getConfiguration('piChat');
  return {
    enabled: cfg.get<boolean>('notifyOnComplete', true),
  };
}

/** True when the user is likely looking elsewhere (window unfocused or view hidden). */
export function shouldNotify(view: vscode.WebviewView | undefined): boolean {
  if (!vscode.window.state.focused) return true; // different app entirely
  return !view?.visible; // same window but chat sidebar not shown
}

export async function notifyTaskComplete(view: vscode.WebviewView | undefined, pendingEdits: number): Promise<void> {
  const { enabled } = notifyConfig();
  if (!enabled) return;
  if (!shouldNotify(view)) return;

  const detail = pendingEdits > 0 ? ` — ${pendingEdits} pending edit${pendingEdits > 1 ? 's' : ''}` : '';
  const pick = await vscode.window.showInformationMessage(`Pi: task finished${detail}`, 'Open Pi Chat');
  if (pick === 'Open Pi Chat') {
    await vscode.commands.executeCommand('workbench.view.extension.pi-chat');
  }
}
