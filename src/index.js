const { default: generate } = require('@babel/generator');
const { ESLint } = require('eslint');
const Collection = require('postman-collection').Collection;
const yargs = require('yargs');
const fs = require('fs-extra');
const path = require('path');
const { generateSuite } = require('./collection');

process.on('unhandledRejection', err => {
  console.error('⚠ unhandled rejection');
  console.error(err);
  process.exit(1);
});

const esLintConfig = {
  root: true,
  extends: [],
  plugins: [],
  parserOptions: {
    ecmaVersion: 2018,
  },
  env: {
    es6: true,
    node: true,
    mocha: true,
  },
  rules: {
    'padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: 'function', next: 'function' },
      { blankLine: 'always', prev: 'expression', next: 'expression' },
      { blankLine: 'never', prev: 'const', next: 'const' },
      { blankLine: 'always', prev: 'const', next: 'expression' },
      { blankLine: 'always', prev: 'expression', next: 'const' },
      { blankLine: 'always', prev: 'let', next: 'expression' },
      { blankLine: 'always', prev: 'expression', next: 'let' },
      { blankLine: 'always', prev: 'const', next: 'let' },
      { blankLine: 'always', prev: 'block', next: 'block' },
    ],
    'prefer-arrow-callback': 'error',
  },
};

const convertCollection = async (source, dest) => {
  const sourceString = await fs.readFile(source);
  const sourceData = JSON.parse(sourceString);
  const sourceCollection = new Collection(sourceData);
  const cleanData = sourceCollection.toJSON();

  const outData = generateSuite(cleanData);
  const { code } = generate(outData);

  const eslint = new ESLint({
    baseConfig: esLintConfig,
    useEslintrc: false,
    fix: true,
  });
  const result = await eslint.lintText(code);

  await fs.writeFile(dest, result[0].output);
};

const convertEnvironment = async (source, dest) => {
  const sourceString = await fs.readFile(source);
  const sourceData = JSON.parse(sourceString);

  const destFile = await fs.open(dest, 'w');

  for (const v of sourceData.values) {
    if (v.enabled) {
      await fs.write(destFile, `${v.key}="${v.value}"\n`);
    }
  }

  await fs.close(destFile);
};

const convertProject = async (collections, environments, dest) => {
  await fs.copy(path.join(__dirname, '../runtime'), dest);

  const testDir = path.join(dest, 'test');
  await fs.ensureDir(testDir);

  for (const collection of collections) {
    const name = path.basename(collection, '.json');
    const outPath = path.join(testDir, `${name}.spec.js`);

    await convertCollection(collection, outPath);
  }

  const envDir = path.join(dest, 'env');
  await fs.ensureDir(envDir);

  for (const environment of environments) {
    const name = path.basename(environment, '.json');
    const outPath = path.join(envDir, `${name}.env`);

    await convertEnvironment(environment, outPath);
  }
};

yargs
  .command({
    command: 'collection <source> <dest>',
    desc: 'convert a single collection',
    handler: ({ source, dest }) => convertCollection(source, dest),
  })
  .command({
    command: 'environment <source> <dest>',
    desc: 'convert a single environment',
    handler: ({ source, dest }) => convertEnvironment(source, dest),
  })
  .command({
    command: 'project <dest>',
    desc: 'convert a whole project',
    builder: b =>
      b
        .option('collection', {
          type: 'array',
          alias: 'c',
          desc: 'collection files to include',
        })
        .option('environment', {
          type: 'array',
          alias: 'e',
          desc: 'environment files to include',
        }),
    handler: ({ collection, environment, dest }) =>
      convertProject(collection, environment, dest),
  })
  .strict()
  .demandCommand()
  .help()
  .parse(process.argv.slice(2));
