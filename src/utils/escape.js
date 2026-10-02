// Escapa comodines de LIKE/ILIKE para que la búsqueda del usuario sea literal
exports.escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

// Escapa texto del usuario antes de meterlo en el HTML de un correo
exports.escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
