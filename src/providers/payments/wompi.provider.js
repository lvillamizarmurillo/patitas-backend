// Wompi (Bancolombia): checkout por redirección + webhook firmado.
// Docs: https://docs.wompi.co — Widget & Checkout Web y "Eventos".
// El comprador paga con Nequi, PSE, botón Bancolombia, tarjeta, etc. en la página de Wompi.
const crypto = require('crypto');
const env = require('../../config/env');

const CHECKOUT_URL = 'https://checkout.wompi.co/p/';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

exports.name = 'wompi';
exports.isEnabled = () => Boolean(env.WOMPI_PUBLIC_KEY && env.WOMPI_INTEGRITY_SECRET && env.WOMPI_EVENTS_SECRET);

// URL de pago. La firma de integridad evita que alguien cambie el monto o la referencia en la URL:
// SHA256(referencia + montoEnCentavos + moneda + fechaExpiración + secretoDeIntegridad)
exports.createCheckout = ({ reference, amount, currency = 'COP', redirectUrl, expiresAt, customerEmail }) => {
  const amountInCents = Math.round(Number(amount) * 100);
  const expirationTime = expiresAt.toISOString();
  const signature = sha256(`${reference}${amountInCents}${currency}${expirationTime}${env.WOMPI_INTEGRITY_SECRET}`);
  const params = new URLSearchParams({
    'public-key': env.WOMPI_PUBLIC_KEY,
    currency,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': signature,
    'redirect-url': redirectUrl,
    'expiration-time': expirationTime,
  });
  if (customerEmail) params.set('customer-data:email', customerEmail);
  return `${CHECKOUT_URL}?${params}`;
};

// Valida el webhook: checksum = SHA256(valores de signature.properties en orden + timestamp + secreto de eventos)
exports.verifyEvent = (body) => {
  const props = body?.signature?.properties;
  const checksum = body?.signature?.checksum;
  if (!Array.isArray(props) || typeof checksum !== 'string' || !body.timestamp || !body.data) return false;
  const values = props.map((path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), body.data));
  if (values.some((v) => v === undefined)) return false;
  const expected = sha256(`${values.join('')}${body.timestamp}${env.WOMPI_EVENTS_SECRET}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(checksum.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Normaliza el evento a { reference, transactionId, status, amount }
// Estados de Wompi: APPROVED, DECLINED, VOIDED, ERROR, PENDING
exports.parseEvent = (body) => {
  const tx = body?.data?.transaction;
  if (body?.event !== 'transaction.updated' || !tx) return null;
  const STATUS = { APPROVED: 'approved', DECLINED: 'declined', VOIDED: 'voided', ERROR: 'error', PENDING: 'pending' };
  return {
    reference: tx.reference, transactionId: tx.id, status: STATUS[tx.status] || 'pending',
    amount: Number(tx.amount_in_cents) / 100, currency: tx.currency,
  };
};
