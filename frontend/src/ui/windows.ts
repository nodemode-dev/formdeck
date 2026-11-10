export async function openWindow(deckId?: string): Promise<void> {
  const url = new URL(location.pathname, location.origin);
  if (deckId) url.searchParams.set('deck', deckId);
  if ('__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_window', { url: url.toString() });
    return;
  }
  if (!window.open(url.toString(), '_blank')) throw new Error('the browser blocked the new window. Allow pop-ups for formdeck and try again.');
}
