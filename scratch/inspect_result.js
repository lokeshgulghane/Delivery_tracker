const { streamText } = require('ai');
const result = streamText({
  model: {
    provider: 'test',
    modelId: 'test',
    specificationVersion: 'v1',
    doGenerate: async () => ({ text: 'test' }),
    doStream: async () => ({ stream: new ReadableStream() }),
  },
  prompt: 'test',
});
console.log('Result keys:', Object.keys(result));
console.log('Result prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(result)));
