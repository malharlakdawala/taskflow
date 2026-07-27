import "server-only";

import DOMPurify from "isomorphic-dompurify";

/**
 * Rich text is stored as HTML and rendered with dangerouslySetInnerHTML, so it
 * must be sanitised before it is written. The API accepts any string, not just
 * what our editor produces, so a caller could otherwise POST a script tag or an
 * onerror handler and have it execute for every other member.
 *
 * Sanitising on write (rather than on render) also protects consumers that
 * bypass the web UI, such as the MCP server's get_task.
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "del", "mark",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "code", "hr",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "src", "alt", "title", "width", "height",
  "class", "colspan", "rowspan", "data-type", "data-checked",
];

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:, data: and other script-bearing URL schemes.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });
}

/** Returns null for content that is empty once markup is removed. */
export function sanitizeOrNull(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeRichText(html);
  const text = clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  const hasMedia = /<(img|table|hr|pre)\b/i.test(clean);
  return text.length > 0 || hasMedia ? clean : null;
}
