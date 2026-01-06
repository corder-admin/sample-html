/**
 * =============================================================================
 * Markdown Renderer Module (markdown-it + Bootstrap 5)
 * =============================================================================
 *
 * markdown-itライブラリを使用した高品質なMarkdown→HTML変換
 * Bootstrap 5クラスを適用してスタイリング
 *
 * 依存: markdown-it (CDN), html2pdf.js (CDN)
 *
 * =============================================================================
 */

// =============================================================================
// Style Constants (Bootstrap 5 Classes)
// =============================================================================

/**
 * Bootstrap class definitions for markdown elements
 * @type {Object}
 */
const MARKDOWN_STYLES = {
  // Headings
  headings: {
    h1: "fw-bold mt-4 mb-3 text-dark fs-3",
    h2: "fw-bold mt-4 mb-3 text-dark fs-4",
    h3: "fw-bold mt-4 mb-2 text-dark fs-5",
    h4: "fw-semibold mt-3 mb-2 text-dark fs-6",
    h5: "fw-semibold mt-3 mb-2 text-dark",
    h6: "fw-medium mt-2 mb-1 text-muted small",
  },
  // Block elements
  paragraph: "mb-3",
  bulletList: "mb-3 ps-4",
  orderedList: "mb-3 ps-4",
  listItem: "mb-1",
  blockquote:
    "border-start border-primary border-4 ps-3 py-2 mb-3 bg-light rounded-end",
  codeBlock: "bg-light p-3 rounded border",
  codeInline: "bg-light px-1 py-0 rounded text-danger",
  table: "table table-sm table-bordered table-striped",
  tableWrapper: "table-responsive mb-3",
  tableHead: "table-light",
  hr: "my-4",
  // Inline elements
  link: "text-primary",
  strong: "fw-bold text-dark",
  emphasis: "fst-italic",
};

/**
 * PDF export configuration
 * @type {Object}
 */
const PDF_CONFIG = {
  margin: [15, 15, 15, 15], // top, left, bottom, right (mm)
  image: { type: "jpeg", quality: 0.95 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    letterRendering: true,
    logging: false,
  },
  jsPDF: {
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  },
  pagebreak: { mode: ["avoid-all", "css", "legacy"] },
};

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
 * @returns {markdownit|null} Configured markdown-it instance
 */
function initMarkdownIt() {
  if (md) return md;

  if (typeof markdownit === "undefined") {
    console.warn("markdown-it not loaded, falling back to simple renderer");
    return null;
  }

  md = markdownit({
    html: false,
    breaks: true,
    linkify: true,
    typographer: true,
  });

  customizeRenderer(md);
  return md;
}

/**
 * Customize markdown-it renderer for Bootstrap styling
 * @param {markdownit} mdInstance - markdown-it instance
 */
function customizeRenderer(mdInstance) {
  const rules = mdInstance.renderer.rules;

  // Preserve default link renderer
  const defaultLinkRender =
    rules.link_open ||
    ((tokens, idx, options, env, self) =>
      self.renderToken(tokens, idx, options));

  // Links
  rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrPush(["class", MARKDOWN_STYLES.link]);
    tokens[idx].attrPush(["target", "_blank"]);
    tokens[idx].attrPush(["rel", "noopener noreferrer"]);
    return defaultLinkRender(tokens, idx, options, env, self);
  };

  // Headings
  rules.heading_open = (tokens, idx) => {
    const tag = tokens[idx].tag;
    return `<${tag} class="${MARKDOWN_STYLES.headings[tag] || ""}">`;
  };

  // Simple open tag rules
  const simpleOpenRules = {
    paragraph_open: ["p", MARKDOWN_STYLES.paragraph],
    bullet_list_open: ["ul", MARKDOWN_STYLES.bulletList],
    ordered_list_open: ["ol", MARKDOWN_STYLES.orderedList],
    list_item_open: ["li", MARKDOWN_STYLES.listItem],
    blockquote_open: ["blockquote", MARKDOWN_STYLES.blockquote],
    thead_open: ["thead", MARKDOWN_STYLES.tableHead],
    strong_open: ["strong", MARKDOWN_STYLES.strong],
    em_open: ["em", MARKDOWN_STYLES.emphasis],
  };

  Object.entries(simpleOpenRules).forEach(([rule, [tag, className]]) => {
    rules[rule] = () => `<${tag} class="${className}">`;
  });

  // Code blocks
  rules.code_block = (tokens, idx) => {
    const content = escapeHtml(tokens[idx].content);
    return `<pre class="${MARKDOWN_STYLES.codeBlock}"><code>${content}</code></pre>`;
  };

  // Inline code
  rules.code_inline = (tokens, idx) => {
    const content = escapeHtml(tokens[idx].content);
    return `<code class="${MARKDOWN_STYLES.codeInline}">${content}</code>`;
  };

  // Tables
  rules.table_open = () =>
    `<div class="${MARKDOWN_STYLES.tableWrapper}"><table class="${MARKDOWN_STYLES.table}">`;
  rules.table_close = () => "</table></div>";

  // Horizontal rule
  rules.hr = () => `<hr class="${MARKDOWN_STYLES.hr}">`;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Escape HTML special characters
 * @param {string} text - Raw text
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const escapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Sanitize filename by removing invalid characters
 * @param {string} name - Original filename
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(name, maxLength = 30) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, maxLength);
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

  const styles = MARKDOWN_STYLES;

  let html = escapeHtml(markdown)
    // Headers (process longest pattern first)
    .replace(/^### (.+)$/gm, `<h5 class="${styles.headings.h5}">$1</h5>`)
    .replace(/^## (.+)$/gm, `<h4 class="${styles.headings.h4}">$1</h4>`)
    .replace(/^# (.+)$/gm, `<h3 class="${styles.headings.h3}">$1</h3>`)
    // Bold and Italic
    .replace(/\*\*(.+?)\*\*/g, `<strong class="${styles.strong}">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em class="${styles.emphasis}">$1</em>`)
    // Inline code
    .replace(/`([^`]+)`/g, `<code class="${styles.codeInline}">$1</code>`)
    // Lists
    .replace(/^- (.+)$/gm, `<li class="${styles.listItem}">$1</li>`)
    .replace(/^\d+\. (.+)$/gm, `<li class="${styles.listItem}">$1</li>`)
    // Paragraphs
    .replace(/\n\n/g, `</p><p class="${styles.paragraph}">`)
    .replace(/\n/g, "<br>");

  // Wrap list items
  html = html.replace(
    /(<li[^>]*>.*?<\/li>)+/gs,
    `<ul class="${styles.bulletList}">$&</ul>`
  );

  return `<div class="ai-report-content"><p class="${styles.paragraph}">${html}</p></div>`;
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

  return renderMarkdownSimple(markdown);
}

// =============================================================================
// PDF Export
// =============================================================================

/**
 * Export AI report content to PDF using html2pdf.js
 * @param {string} elementId - ID of the element to export
 * @param {string} filename - PDF filename (without extension)
 * @param {Object} options - Optional configuration overrides
 * @returns {Promise<void>}
 */
async function exportReportToPdf(
  elementId,
  filename = "ai-report",
  options = {}
) {
  if (typeof html2pdf === "undefined") {
    console.error("html2pdf.js not loaded");
    alert("PDF出力ライブラリが読み込まれていません");
    return;
  }

  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id "${elementId}" not found`);
    return;
  }

  const mergedOptions = {
    ...PDF_CONFIG,
    filename: `${filename}.pdf`,
    ...options,
  };

  try {
    console.log("Generating PDF...");
    await html2pdf().set(mergedOptions).from(element).save();
    console.log("PDF generated successfully");
  } catch (error) {
    console.error("PDF generation failed:", error);
    alert("PDF生成に失敗しました: " + error.message);
  }
}

/**
 * Export AI report with item name in filename
 * @param {string} itemName - Item name for filename
 * @returns {Promise<void>}
 */
function exportAiReportToPdf(itemName = "") {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const sanitizedName = sanitizeFilename(itemName);
  const filename = sanitizedName
    ? `AI分析レポート_${sanitizedName}_${timestamp}`
    : `AI分析レポート_${timestamp}`;

  return exportReportToPdf("ai-report-content", filename);
}
