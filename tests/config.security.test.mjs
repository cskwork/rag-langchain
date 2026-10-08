import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const configSource = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8')
  .replace(/import dotenv from ['"]dotenv['"];?/, '')
  .replace('export const CONFIG', 'const CONFIG');
const fixture = { OPENROUTER_API_KEY: 'offline-router-fixture', OPENAI_API_KEY: 'offline-embedding-fixture' };
function readConfig(env) {
  const output = [];
  const context = { process: { env }, dotenv: { config() {} }, console: { log: (...values) => output.push(values) } };
  const config = vm.runInNewContext(`${configSource}\nCONFIG;`, context);
  return { config, output };
}

test('missing and blank provider credentials still fail explicitly', () => {
  for (const name of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY']) {
    for (const value of [undefined, '', '   ']) {
      assert.throws(() => readConfig({ ...fixture, [name]: value }));
    }
  }
});

test('valid supplied inputs remain usable and are never logged', () => {
  const { config, output } = readConfig(fixture);
  assert.equal(config.OPENROUTER.API_KEY, fixture.OPENROUTER_API_KEY);
  assert.equal(config.OPENAI.API_KEY, fixture.OPENAI_API_KEY);
  assert.deepEqual(output, []);
});

test('example configuration no longer supplies a real-format OpenRouter key', () => {
  const template = readFileSync(new URL('../env.example', import.meta.url), 'utf8');
  assert.match(template, /^OPENROUTER_API_KEY=$/m);
  assert.doesNotMatch(template, /sk-or-v1-[a-f0-9]{64}/i);
});

test('standalone provider diagnostics do not print credential fragments', () => {
  for (const path of ['../test-openrouter-direct.js', '../test-openrouter-llm.js']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\.log\([^\n]*CONFIG\.OPENROUTER\.API_KEY/);
  }
});
