/** Apple's title style, as docs/design/rules.md section 18 and
 *  scripts/build/wording.py write it: each word capitalised but the
 *  articles, the conjunctions and the short prepositions within; a code or
 *  a figure is left as it is. The tests hold the app's names to it. */
const MINOR = new Set("a an the and but or nor for so yet as at by in into of off on onto out per to up via with from".split(" "));

export function isTitleCase(name: string): boolean {
  const words = name.split(" ");
  return words.every((word, i) => {
    const core = word.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
    if (!core || !/^\p{L}/u.test(core)) return true;
    if (MINOR.has(core.toLowerCase()) && i > 0 && i < words.length - 1) return core === core.toLowerCase();
    return core[0] === core[0]!.toUpperCase();
  });
}
