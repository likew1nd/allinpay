import fastifyMultipart from '@fastify/multipart';
import { Logger } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { USER_AGENT } from '@lib/constants/rest.constant';

const app: FastifyAdapter = new FastifyAdapter({
  logger: false,
  // 采集端上报的巡检结果带截图，Fastify 默认的 1MB 不够；单张截图在 DTO 中另有 3M 字符上限
  bodyLimit: 8 * 1024 * 1024,
});
export { app as fastifyApp };

app.register(fastifyMultipart, {
  limits: {
    fields: 10, // Max number of non-file fields
    fileSize: 1024 * 1024 * 6, // limit size 6M
    files: 5, // Max number of file fields
  },
});

app.getInstance().addHook('onError', async (request, reply) => {
  const ip = request.ip;
  const userAgent = request.headers[USER_AGENT];
  const url = request.url;

  Logger.log(
    `NotFound: IP:${ip}, UA+${userAgent}, URL=${url}`,
    'fastify.adapter',
  );

  reply.status(500).send({ error: 'error' });
});
