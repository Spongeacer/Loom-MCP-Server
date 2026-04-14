const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const server = new Server({ name: 'test', version: '1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [{ name: 'hello', description: 'hello world', inputSchema: { type: 'object', properties: {} } }] };
});

server.setRequestHandler(CallToolRequestSchema, async () => {
  return { content: [{ type: 'text', text: 'hello' }] };
});

async function main() {
  console.error('TEST MCP STARTING');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TEST MCP CONNECTED');
}

main().catch(e => { console.error(e); process.exit(1); });
