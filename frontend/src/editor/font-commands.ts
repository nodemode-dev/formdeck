import type { Deck } from '../engine/model';
import { api } from '../io/api';
import { fontsOfDeck } from '../render/fonts';
import type { Commands } from '../ui/commands';
import { replaceFontsDialog } from '../ui/dialogs-replace-fonts';
import { toast } from '../ui/toast';
import type { Editor } from './editor';

interface FontMedia { name?: string; mime?: string; family?: string; style?: string; weight?: number }

export function deckFontFamilies(deck: Pick<Deck, 'media'> | undefined): string[] {
  const out = new Set<string>();
  for (const m of Object.values((deck?.media ?? {}) as Record<string, FontMedia>)) {
    if (m.family && m.mime?.startsWith('font/')) out.add(m.family);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

async function addFont(ed: Editor, file: File): Promise<void> {
  try {
    const [m] = await api.upload([file]);
    const meta = m as typeof m & FontMedia & { subfamily?: string; italic?: boolean };
    if (!meta.mime.startsWith('font/') || !meta.family) {
      toast(`${file.name} is not a font file. Choose a TTF, OTF, WOFF or WOFF2 file.`, 'error');
      return;
    }
    const value: Record<string, unknown> = { name: meta.name, mime: meta.mime, bytes: meta.bytes, family: meta.family, style: meta.style ?? 'regular' };
    if (meta.weight) value.weight = meta.weight;
    if (meta.subfamily) value.subfamily = meta.subfamily;
    if (meta.italic) value.italic = true;
    const known = !!ed.doc.deck.media[meta.id];
    if (!known) ed.apply([{ op: 'set', path: ['media', meta.id], value }], `Add font ${meta.family}`);
    fontsOfDeck(ed.doc.deck);
    const bold = (meta.style ?? '').startsWith('bold');
    const italic = (meta.style ?? '').endsWith('talic');
    await document.fonts.load(`${italic ? 'italic ' : ''}${bold ? 700 : 400} 16px "${meta.family}"`).catch(() => []);
    toast(known ? `${meta.family} is already in this deck` : `Added ${meta.family}${meta.subfamily && meta.subfamily !== 'Regular' ? ` ${meta.subfamily}` : ''} to this deck`);
  } catch (e) {
    toast(`Could not add ${file.name}: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

export function registerFontCommands(cmds: Commands, editor: () => Editor | null): void {
  cmds.add({
    id: 'replace-fonts',
    label: 'Replace Fonts...',
    enabled: () => !!editor(),
    run: () => { const ed = editor(); if (ed) replaceFontsDialog(ed); },
  });
  cmds.add({
    id: 'add-font',
    label: 'Add Font...',
    enabled: () => !!editor(),
    run: () => {
      const ed = editor();
      if (!ed) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ttf,.otf,.woff,.woff2';
      input.multiple = true;
      input.onchange = async () => {
        for (const f of Array.from(input.files ?? [])) await addFont(ed, f);
      };
      input.click();
    },
  });
}
