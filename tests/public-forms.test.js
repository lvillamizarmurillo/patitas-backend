const { API, api, auth, resetDb, createUser, captureMail } = require('./helpers');
const { NewsletterSubscriber, SupportMessage } = require('../src/models');

beforeAll(resetDb);

describe('Newsletter', () => {
  test('suscribe, es idempotente, confirma por correo solo en altas y reactivaciones', async () => {
    const mails = captureMail();
    await api().post(`${API}/newsletter/subscribe`).send({ email: 'Fan@Test.com' }).expect(200);
    await api().post(`${API}/newsletter/subscribe`).send({ email: 'fan@test.com' }).expect(200);
    expect(await NewsletterSubscriber.count()).toBe(1);
    expect(mails.filter((m) => m.to === 'fan@test.com')).toHaveLength(1);

    await api().post(`${API}/newsletter/unsubscribe`).send({ email: 'fan@test.com' }).expect(200);
    expect((await NewsletterSubscriber.findOne()).unsubscribedAt).not.toBeNull();
    await api().post(`${API}/newsletter/subscribe`).send({ email: 'fan@test.com' }).expect(200);
    expect((await NewsletterSubscriber.findOne()).unsubscribedAt).toBeNull();
    expect(mails.filter((m) => m.to === 'fan@test.com')).toHaveLength(2);
  });

  test('correo inválido → 400; baja de un correo inexistente no revela nada', async () => {
    await api().post(`${API}/newsletter/subscribe`).send({ email: 'malo' }).expect(400);
    await api().post(`${API}/newsletter/unsubscribe`).send({ email: 'nunca@test.com' }).expect(200);
  });
});

describe('Escríbenos (soporte)', () => {
  test('visitante: guarda, avisa a soporte con Reply-To, acusa recibo sin repetir el contenido y escapa HTML', async () => {
    const mails = captureMail();
    await api().post(`${API}/support/contact`)
      .send({ name: 'Visitante <script>x</script>', email: 'visitante@test.com', message: 'Hola <b>equipo</b>, una pregunta' })
      .expect(201);
    expect(await SupportMessage.count({ where: { email: 'visitante@test.com' } })).toBe(1);

    const toSupport = mails.find((m) => m.to === 'soporte@puppymarketcol.com');
    expect(toSupport.replyTo).toBe('visitante@test.com');
    expect(toSupport.html).toContain('&lt;b&gt;equipo&lt;/b&gt;');
    expect(toSupport.html).not.toContain('<script>');

    const ack = mails.find((m) => m.to === 'visitante@test.com');
    expect(ack.subject).toContain('Recibimos tu mensaje');
    expect(ack.html).not.toContain('una pregunta'); // no repite el mensaje del usuario
    expect(ack.html).not.toContain('Visitante'); // ni su nombre
  });

  test('sin sesión exige nombre y correo; con sesión los toma del usuario', async () => {
    captureMail();
    await api().post(`${API}/support/contact`).send({ message: 'Necesito ayuda con mi cuenta' }).expect(400);
    const { user, token } = await createUser();
    await api().post(`${API}/support/contact`).set(auth(token)).send({ message: 'Necesito ayuda con mi cuenta' }).expect(201);
    const msg = await SupportMessage.findOne({ where: { userId: user.id } });
    expect(msg).toMatchObject({ email: user.email, name: user.fullName });
  });

  test('token inválido no rompe el formulario público', async () => {
    captureMail();
    await api().post(`${API}/support/contact`).set(auth('token.roto.x'))
      .send({ name: 'Ana Ruiz', email: 'ana@test.com', message: 'Mensaje con token roto' }).expect(201);
  });
});
