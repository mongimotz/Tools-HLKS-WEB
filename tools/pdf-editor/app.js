// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller of the PDF-Editor (stage 1 spike): mounts the vendored EmbedPDF viewer.

await import('../../lib/vendor/embedpdf/embedpdf.js');
document.getElementById('viewer').config = { locale: 'de' };
