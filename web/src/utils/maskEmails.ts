/**
 * Mask every `local@domain` occurrence in free text for the "hide emails"
 * privacy view.
 *
 * Credential filenames embed accounts (`claude-tom@1xyz.dev.json`,
 * `codex-2a524877-m.varnskuehler@gmail.com-pro.json`), so masking can't just
 * target a whole string — it rewrites each address in place:
 *
 * - everything up to and including the last `-` or `_` before the local part
 *   is kept (provider prefixes and auth-file name fragments stay readable);
 * - of the local part only the first character survives, then `•••`;
 * - after `@` only the first character of the first domain label survives,
 *   then `•••`, and everything after that label (dots, TLD, `-pro.json`
 *   suffixes) is kept unchanged.
 */

const MASK = '•••';

export function maskEmails(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+/g, (address) => {
    const atIndex = address.lastIndexOf('@');
    const local = address.slice(0, atIndex);
    const domain = address.slice(atIndex + 1);
    if (!local || !domain) return address;

    const separatorIndex = Math.max(local.lastIndexOf('-'), local.lastIndexOf('_'));
    const prefix = local.slice(0, separatorIndex + 1);
    const localPart = local.slice(separatorIndex + 1);
    if (!localPart) return address;

    const dotIndex = domain.indexOf('.');
    const firstLabel = dotIndex === -1 ? domain : domain.slice(0, dotIndex);
    const rest = dotIndex === -1 ? '' : domain.slice(dotIndex);
    if (!firstLabel) return address;

    return `${prefix}${localPart[0]}${MASK}@${firstLabel[0]}${MASK}${rest}`;
  });
}
