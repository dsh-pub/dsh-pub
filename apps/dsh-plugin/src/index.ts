import type { Context } from '@deepseek-ai/cordis';

import { registrySkill } from './registry-skill.js';

/**
 * dsh.pub directory plugin, node half.
 *
 * The host half contributes one embedded skill to any profile that mounts the
 * DSH skill registry, so agents can use natural language to search the dsh.pub
 * registry and install genuinely installable Git bundles. The browser half
 * (`client`) remains the read-only bilingual directory in Settings.
 */

/** Service names this host plugin requires at startup. The skill registry is optional. */
export const inject = [] as const;

/**
 * Host plugin body. Register the dsh.pub registry skill the moment the `skills`
 * service is available; when the profile has no skill registry, the plugin
 * loads as a harmless read-only directory.
 */
export function apply(ctx: Context): void {
  ctx.inject(['skills'], (skillCtx) => {
    skillCtx.effect(
      () => skillCtx.skills.register(registrySkill),
      'dsh-pub: register registry skill',
    );
  });
}
