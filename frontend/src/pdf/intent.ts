export type CreateKind = 'pictures' | 'files';

let pending: CreateKind | null = null;

export function requestCreate(kind: CreateKind): void { pending = kind; }

export function takeCreate(): CreateKind | null {
  const k = pending;
  pending = null;
  return k;
}
