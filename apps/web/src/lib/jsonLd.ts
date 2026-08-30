/** Safe to inject via `dangerouslySetInnerHTML` inside a `<script type="application/ld+json">`.
 *  `JSON.stringify` alone is not enough: it escapes for JSON syntax, not for the surrounding
 *  HTML/script context, so a `</script>` sequence inside any field (catalog product names and
 *  descriptions are free-text, validated for length only) would prematurely close the tag and
 *  let the rest of its content run as markup/script. Escaping `<` (the only character that can
 *  start that breakout) as its JSON/JS-safe `<` unicode escape neutralizes it without
 *  changing the parsed value. */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
