import { DirectorySection } from './DirectorySection.js';
import type { DshClientContext } from './dsh-contract.js';
import { en, zh } from './locales.js';
import { styles } from './styles.js';

export { DirectorySection } from './DirectorySection.js';
export type { DirectorySectionProps } from './dsh-contract.js';

const namespace = 'dshPub.directory';
const packageId = '@dsh-pub/plugin-directory';

/** Required DSH client services. */
export const inject = ['slots', 'locale'];

function mountStyles(): void | (() => void) {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector<HTMLStyleElement>(
    `style[data-plugin-css="${packageId}"]`,
  );
  if (existing) return;

  const tag = document.createElement('style');
  tag.dataset.plugin = packageId;
  tag.dataset.pluginCss = packageId;
  tag.textContent = styles;
  document.head.append(tag);
  return () => tag.remove();
}

/** Register the bilingual dsh.pub directory as one DSH Settings section. */
export function apply(ctx: DshClientContext): void {
  ctx.effect(() => ctx.locale.register(namespace, { en, zh }), 'dsh.pub: dictionaries');
  ctx.effect(mountStyles, 'dsh.pub: directory styles');

  const t = ctx.locale.bind(namespace);
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-pub-directory',
        order: 30,
        label: () => t('nav'),
        locale: namespace,
      },
      DirectorySection,
    ),
  );
}
