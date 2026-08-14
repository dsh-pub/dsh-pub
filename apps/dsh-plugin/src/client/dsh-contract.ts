import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-locale/client';

import type { DirectoryKey } from './locales.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dshPub.directory': DirectoryKey;
  }
}

export type DirectorySectionProps = SettingsSectionOwnerProps & {
  t: Translate<DirectoryKey>;
};

export type DshClientContext = ClientContext;
