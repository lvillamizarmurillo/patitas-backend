// Cierra conexiones al final de cada archivo de tests para que Jest termine limpio.
afterAll(async () => {
  jest.restoreAllMocks();
  await require('../src/modules/contracts/pdf.service').close();
  await require('../src/models').sequelize.close();
});
