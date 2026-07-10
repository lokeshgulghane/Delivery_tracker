const ai = require('ai');
const keys = Object.keys(ai);
console.log('Stream/Response related exports:', keys.filter(k => k.toLowerCase().includes('stream') || k.toLowerCase().includes('response')));
