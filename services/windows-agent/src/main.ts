import { createRuntime } from './runner.js';

const runtime = createRuntime();
process.once('SIGINT', () => runtime.stop());
process.once('SIGTERM', () => runtime.stop());
runtime.run().catch(error => {
  console.error('[agent] ' + (error instanceof Error ? error.message : '采集端启动失败'));
  process.exitCode = 1;
});
