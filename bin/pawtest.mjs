#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2))
  .then((code) => {
    if (typeof code === 'number' && code !== 0) process.exit(code);
  })
  .catch((err) => {
    console.error(`\n🐾 PawTest Error: ${err.message}`);
    process.exit(1);
  });
