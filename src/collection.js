const { parse } = require('@babel/parser');
const { default: traverse } = require('@babel/traverse');
const { default: template } = require('@babel/template');
const t = require('@babel/types');
const visitor = require('./scripts');

const commentBlock = value => ({
  type: 'CommentBlock',
  value,
});

const generateEnvironmentGet = key =>
  t.callExpression(
    t.memberExpression(t.identifier('environment'), t.identifier('get')),
    [t.stringLiteral(key)],
  );

const generateEnvironmentTemplate = str => {
  const parts = str.match(/([\s\S]*?(?=\{\{|$))(\{\{.*?\}\})?/g).slice(0, -1);

  const quasis = [];
  const expressions = [];

  for (const p of parts) {
    const [_, q, e] = p.match(/([\s\S]*?(?=\{\{|$))(\{\{.*?\}\})?/);

    quasis.push(t.templateElement({ cooked: q, raw: q }));

    if (e) {
      const id = e.match(/(?:\{\{(.*?)\}\})/)[1];
      expressions.push(generateEnvironmentGet(id));
    }
  }

  if (quasis.length === expressions.length) {
    quasis.push(t.templateElement({ cooked: '', raw: '' }));
  }

  return t.templateLiteral(quasis, expressions);
};

const generateUrl = source =>
  generateEnvironmentTemplate(`${source.host}/${source.path.join('/')}`);

const generateRequestAssignment = source => {
  const props = [];

  if (source.method) {
    props.push(
      t.objectProperty(t.identifier('method'), t.stringLiteral(source.method)),
    );
  }

  if (source.header) {
    props.push(
      t.objectProperty(
        t.identifier('headers'),
        generateRequestHeaders(source.header),
      ),
    );
  }

  if (source.body && source.body.mode === 'raw' && source.body.raw.length) {
    props.push(
      t.objectProperty(
        t.identifier('body'),
        generateEnvironmentTemplate(source.body.raw),
      ),
    );
  }

  return t.objectExpression(props);
};

const generateItemProperties = template(`
  let request;
  let url;
  let response;
  let json;
`);

const generateItemComments = source =>
  source.request && source.request.description
    ? [commentBlock(source.request.description.content)]
    : [];

const generateRequestHeaders = source =>
  t.objectExpression(
    source.map(h =>
      t.objectProperty(t.stringLiteral(h.key), t.stringLiteral(h.value)),
    ),
  );

const generateBeforeBlockWrapper = template(`
  before(async () => {
    %%contents%%
  });
`);

const generateFetchCall = template(
  `
  url = %%url%%;
  request= %%request%%;
  response = await fetch(url, request);
  json = await response.json();
`,
  { allowAwaitOutsideFunction: true },
);

const generatePrerequest = source => {
  if (!source.event) {
    return [];
  }

  const script = source.event
    .filter(e => e.listen === 'prerequest')
    .map(e => e.script)
    .filter(s => s.type === 'text/javascript')
    .map(s => s.exec.join('\n'))
    .join('\n');

  const ast = parse(script);

  traverse(ast, visitor);

  return ast.program.body;
};

const generateBeforeBlock = source => {
  if (!source.request) {
    return [];
  }

  const url = generateUrl(source.request.url);
  const request = generateRequestAssignment(source.request);

  const fetchCall = generateFetchCall({ url, request });
  const preRequest = generatePrerequest(source);

  return [
    generateBeforeBlockWrapper({
      contents: [...fetchCall, ...preRequest],
    }),
  ];
};

const generateCases = source => {
  if (!source.event) {
    return [];
  }

  const script = source.event
    .filter(e => e.listen === 'test')
    .map(e => e.script)
    .filter(s => s.type === 'text/javascript')
    .map(s => s.exec.join('\n'))
    .join('\n');

  const ast = parse(script);

  traverse(ast, visitor);

  return ast.program.body;
};

const generateItem = source => {
  const leadingComments = generateItemComments(source);
  const properties = source.request ? generateItemProperties() : [];
  const before = generateBeforeBlock(source);
  const items = source.item ? source.item.map(generateItem) : [];
  const tests = generateCases(source);

  return {
    type: 'ExpressionStatement',
    expression: t.callExpression(t.identifier('describe'), [
      t.stringLiteral(source.name),
      t.arrowFunctionExpression(
        [],
        t.blockStatement([...properties, ...before, ...items, ...tests]),
        false,
      ),
    ]),

    leadingComments,
  };
};

const generateHeader = template(`
  const chai = require('chai');
  const chaiFetch = require('chai-fetch');
  const fetch = require('node-fetch');
  const tv4 = require('tv4');

  chai.use(chaiFetch);
  const { expect } = chai;

  const environment = new Map(Object.entries(process.env));
`);

const generateSuite = source => {
  const header = generateHeader();
  const items = source.item.map(generateItem);

  return t.file(t.program([...header, ...items]));
};

module.exports = { generateSuite };
