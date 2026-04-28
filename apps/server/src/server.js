import { createServer } from 'node:http';
import { createExampleProject } from '../../../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../../../packages/rules/src/validationEngine.js';

const port = Number(process.env.PORT || 8787);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'boundaryml-server' }));
    return;
  }

  if (req.url === '/api/projects/example') {
    const project = createExampleProject();
    const validation = validateWorkflow(project.workflow, project.assets);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ project, validation }));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(port, () => {
  console.log(`BoundaryML Server listening on http://localhost:${port}`);
});
