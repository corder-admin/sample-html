/**
 * =============================================================================
 * Markdown Renderer Module (markdown-it + Bootstrap 5)
 * =============================================================================
 *
 * markdown-itライブラリを使用した高品質なMarkdown→HTML変換
 * Bootstrap 5クラスを適用してスタイリング
 *
 * 依存: markdown-it (CDN)
 *
 * =============================================================================
 */

// =============================================================================
// markdown-it Configuration
// =============================================================================

/**
 * markdown-it instance with custom configuration
 * @type {markdownit|null}
 */
let md = null;

/**
 * Initialize markdown-it with Bootstrap-friendly settings
 * @returns {markdownit} Configured markdown-it instance
 */
function initMarkdownIt() {
  if (md) return md;

  // Check if markdown-it is loaded
  if (typeof markdownit === "undefined") {
    console.warn("markdown-it not loaded, falling back to simple renderer");
    return null;
  }

  md = markdownit({
    html: false, // Disable HTML tags for security
    breaks: true, // Convert \n to <br>
    linkify: true, // Auto-convert URLs to links
    typographer: true, // Smart quotes and dashes
  });

  // Custom renderer rules for Bootstrap classes
  customizeRenderer(md);

  return md;
}

/**
 * Customize markdown-it renderer for Bootstrap styling
 * @param {markdownit} mdInstance - markdown-it instance
 */
function customizeRenderer(mdInstance) {
  const defaultRender =
    mdInstance.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  // Links: Add Bootstrap classes and target="_blank"
  mdInstance.renderer.rules.link_open = function (
    tokens,
    idx,
    options,
    env,
    self
  ) {
    tokens[idx].attrPush(["class", "text-primary"]);
    tokens[idx].attrPush(["target", "_blank"]);
    tokens[idx].attrPush(["rel", "noopener noreferrer"]);
    return defaultRender(tokens, idx, options, env, self);
  };

  // Headings: Add Bootstrap classes
  mdInstance.renderer.rules.heading_open = function (tokens, idx) {
    const tag = tokens[idx].tag;
    const classes = {
      h1: "fw-bold mt-4 mb-3 text-dark fs-3",
      h2: "fw-bold mt-4 mb-3 text-dark fs-4",
      h3: "fw-bold mt-4 mb-2 text-dark fs-5",
      h4: "fw-semibold mt-3 mb-2 text-dark fs-6",
      h5: "fw-semibold mt-3 mb-2 text-dark",
      h6: "fw-medium mt-2 mb-1 text-muted small",
    };
    return `<${tag} class="${classes[tag] || ""}">`;
  };

  // Paragraphs: Add margin
  mdInstance.renderer.rules.paragraph_open = function () {
    return '<p class="mb-3">';
  };

  // Unordered lists: Bootstrap styling
  mdInstance.renderer.rules.bullet_list_open = function () {
    return '<ul class="mb-3 ps-4">';
  };

  // Ordered lists: Bootstrap styling
  mdInstance.renderer.rules.ordered_list_open = function () {
    return '<ol class="mb-3 ps-4">';
  };

  // List items: Add margin
  mdInstance.renderer.rules.list_item_open = function () {
    return '<li class="mb-1">';
  };

  // Code blocks: Bootstrap styling
  mdInstance.renderer.rules.code_block = function (tokens, idx) {
    const content = escapeHtml(tokens[idx].content);
    return `<pre class="bg-light p-3 rounded border"><code>${content}</code></pre>`;
  };

  // Inline code: Bootstrap styling
  mdInstance.renderer.rules.code_inline = function (tokens, idx) {
    const content = escapeHtml(tokens[idx].content);
    return `<code class="bg-light px-1 py-0 rounded text-danger">${content}</code>`;
  };

  // Blockquotes: Bootstrap alert styling
  mdInstance.renderer.rules.blockquote_open = function () {
    return '<blockquote class="border-start border-primary border-4 ps-3 py-2 mb-3 bg-light rounded-end">';
  };

  // Tables: Bootstrap table classes
  mdInstance.renderer.rules.table_open = function () {
    return '<div class="table-responsive mb-3"><table class="table table-sm table-bordered table-striped">';
  };

  mdInstance.renderer.rules.table_close = function () {
    return "</table></div>";
  };

  mdInstance.renderer.rules.thead_open = function () {
    return '<thead class="table-light">';
  };

  // Horizontal rules
  mdInstance.renderer.rules.hr = function () {
    return '<hr class="my-4">';
  };

  // Strong: Bold text with red color
  mdInstance.renderer.rules.strong_open = function () {
    return '<strong class="fw-bold text-danger">';
  };

  // Emphasis: Italic text
  mdInstance.renderer.rules.em_open = function () {
    return '<em class="fst-italic">';
  };
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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =============================================================================
// Fallback Simple Renderer
// =============================================================================

/**
 * Simple fallback Markdown renderer (if markdown-it not available)
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
function renderMarkdownSimple(markdown) {
  if (!markdown) return "";

  let html = escapeHtml(markdown)
    // Headers
    .replace(
      /^### (.+)$/gm,
      '<h5 class="fw-bold mt-4 mb-2 text-primary fs-5">$1</h5>'
    )
    .replace(
      /^## (.+)$/gm,
      '<h4 class="fw-bold mt-4 mb-3 text-primary fs-4">$1</h4>'
    )
    .replace(
      /^# (.+)$/gm,
      '<h3 class="fw-bold mt-4 mb-3 text-primary fs-3">$1</h3>'
    )
    // Bold and Italic
    .replace(/\*\*(.+?)\*\*/g, '<strong class="fw-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="fst-italic">$1</em>')
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-light px-1 py-0 rounded text-danger">$1</code>'
    )
    // Lists
    .replace(/^- (.+)$/gm, '<li class="mb-1">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="mb-1">$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, "<br>");

  // Wrap list items
  html = html.replace(
    /(<li[^>]*>.*?<\/li>)+/gs,
    '<ul class="mb-3 ps-4">$&</ul>'
  );

  return `<div class="ai-report-content"><p class="mb-3">${html}</p></div>`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Convert Markdown text to HTML with Bootstrap styling
 * Uses markdown-it if available, falls back to simple renderer
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
function renderMarkdown(markdown) {
  if (!markdown) return "";

  const mdInstance = initMarkdownIt();

  if (mdInstance) {
    const html = mdInstance.render(markdown);
    return `<div class="ai-report-content">${html}</div>`;
  }

  // Fallback to simple renderer
  return renderMarkdownSimple(markdown);
}
