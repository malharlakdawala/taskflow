import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Rich text is stored as HTML and rendered with dangerouslySetInnerHTML, so it
 * must be sanitised. The API accepts any string, not just what our editor
 * produces, so a caller could otherwise store a script tag or an onerror
 * handler and have it execute for every other member.
 *
 * Uses sanitize-html rather than DOMPurify deliberately: DOMPurify needs a DOM,
 * which on the server means jsdom, and that failed to bundle on Vercel — every
 * route importing it returned a 500. sanitize-html parses with htmlparser2, so
 * it is pure JavaScript, works in any runtime, and keeps cold starts small.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del", "mark",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "pre", "code", "hr",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class", "colspan", "rowspan", "data-type", "data-checked"],
  },
  // No data: or javascript:. Blocks both script execution and megabyte-sized
  // base64 blobs being pasted straight into the database.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  transformTags: {
    // Anything opening a new tab should not be able to reach window.opener.
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** Returns null for content that is empty once markup is removed. */
export function sanitizeOrNull(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeRichText(html);
  const text = clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  const hasMedia = /<(img|table|hr|pre)\b/i.test(clean);
  return text.length > 0 || hasMedia ? clean : null;
}
