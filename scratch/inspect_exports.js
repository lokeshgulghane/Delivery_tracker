const ai = require('ai');
console.log('AI SDK Exports:', Object.keys(ai).filter(x => !x.startsWith('experimental_') && !x.startsWith('unstable_')));
