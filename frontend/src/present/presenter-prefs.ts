const PV_KEY = 'formdeck.usePresenterView';

export function usePresenterView(): boolean {
  try { return localStorage.getItem(PV_KEY) !== '0'; } catch { return true; }
}

export function setUsePresenterView(on: boolean): void {
  try { localStorage.setItem(PV_KEY, on ? '1' : '0'); } catch { return; }
}
