/**
 * =============================================================================
 * Markdown Renderer Module
 * =============================================================================
 *
 * シンプルなMarkdown→HTML変換機能を提供
 * Bootstrap 5クラスを使用したスタイリング
 *
 * =============================================================================
 */

// =============================================================================
// CSS Class Definitions
// =============================================================================

const MD_CLASSES = {
  h3: "fw-bold mt-4 mb-3 text-primary",
  h4: "fw-bold mt-4 mb-3 text-primary",
  h5: "fw-bold mt-4 mb-2 text-primary",
  code: "bg-light px-1 rounded",
  list: "mb-3 ps-3",
  listItem: "mb-1",
  paragraph: "mb-3",
  wrapper: "ai-report-markdown",
};

// =============================================================================
// Markdown to HTML Converter
// =============================================================================

/**
 * Convert Markdown text to HTML with Bootstrap styling
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
function renderMarkdown(markdown) {
  if (!markdown) return "";

  let html = escapeHtml(markdown);
  html = convertHeaders(html);
  html = convertInlineStyles(html);
  html = convertLists(html);
  html = convertParagraphs(html);
  html = wrapListItems(html);

  return `<div class="${MD_CLASSES.wrapper}"><p class='${MD_CLASSES.paragraph}'>${html}</p></div>`;
}

/**
 * Escape HTML special characters
 * @param {string} text - Raw text
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert Markdown headers to HTML
 * @param {string} html - Input HTML
 * @returns {string} Converted HTML
 */
function convertHeaders(html) {
  return html
    .replace(/^### (.+)$/gm, `<h5 class="${MD_CLASSES.h5}">$1</h5>`)
    .replace(/^## (.+)$/gm, `<h4 class="${MD_CLASSES.h4}">$1</h4>`)
    .replace(/^# (.+)$/gm, `<h3 class="${MD_CLASSES.h3}">$1</h3>`);
}

/**
 * Convert inline styles (bold, italic, code)
 * @param {string} html - Input HTML
 * @returns {string} Converted HTML
 */
function convertInlineStyles(html) {
  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, `<code class="${MD_CLASSES.code}">$1</code>`);
}

/**
 * Convert list items
 * @param {string} html - Input HTML
 * @returns {string} Converted HTML
 */
function convertLists(html) {
  return html
    .replace(/^- (.+)$/gm, `<li class="${MD_CLASSES.listItem}">$1</li>`)
    .replace(/^\d+\. (.+)$/gm, `<li class="${MD_CLASSES.listItem}">$1</li>`);
}

/**
 * Convert paragraphs and line breaks
 * @param {string} html - Input HTML
 * @returns {string} Converted HTML
 */
function convertParagraphs(html) {
  return html
    .replace(/\n\n/g, `</p><p class='${MD_CLASSES.paragraph}'>`)
    .replace(/\n/g, "<br>");
}

/**
 * Wrap consecutive list items in ul tags
 * @param {string} html - Input HTML
 * @returns {string} Converted HTML
 */
function wrapListItems(html) {
  return html.replace(
    /(<li[^>]*>.*?<\/li>)+/gs,
    `<ul class="${MD_CLASSES.list}">$&</ul>`
  );
}
