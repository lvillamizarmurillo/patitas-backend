const env = require('../config/env');
const logger = require('../config/logger');

// Hoy: se ejecuta inline en el mismo proceso (sin costo extra de infraestructura).
// El día que definan CONTRACT_QUEUE_URL (una cola SQS en AWS), esto cambia de
// "generar ya" a "encolar", sin tocar el resto de la app.
exports.enqueueContractGeneration = async (appointmentId) => {
  if (env.CONTRACT_QUEUE_URL) {
    const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
    const client = new SQSClient({ region: env.AWS_REGION });
    await client.send(new SendMessageCommand({
      QueueUrl: env.CONTRACT_QUEUE_URL,
      MessageBody: JSON.stringify({ appointmentId }),
    }));
    return;
  }
  require('../modules/contracts/contract.service').generateForAppointment(appointmentId)
    .catch((err) => logger.error({ err, appointmentId }, 'Falló la generación del contrato'));
};