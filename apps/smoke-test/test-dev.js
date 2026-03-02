import { createDevServer } from '../zenith-cli/src/dev-server.js';
import path from 'path';

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

createDevServer({
  pagesDir: path.join(process.cwd(), 'src/pages'),
  outDir: path.join(process.cwd(), 'dist'),
  port: 3000,
  config: {}
}).then(({ port }) => {
  console.log(`Server started on port ${port}`);
}).catch(console.error);
