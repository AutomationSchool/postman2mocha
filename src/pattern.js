const { default: template } = require('@babel/template');
const t = require('@babel/types');

const isPlaceholder = node =>
  t.isIdentifier(node) && node.name.toUpperCase() === node.name;

const match = (pattern, actual) => {
  if (isPlaceholder(pattern)) {
    return { [pattern.name]: actual };
  }

  if (
    t.isIdentifier(pattern) &&
    t.isIdentifier(actual) &&
    pattern.name === actual.name
  ) {
    return {};
  }

  if (t.isExpressionStatement(pattern)) {
    return match(pattern.expression, actual);
  }

  if (t.isExpressionStatement(actual)) {
    return match(pattern, actual.expression);
  }

  if (t.isMemberExpression(pattern) && t.isMemberExpression(actual)) {
    const obj = match(pattern.object, actual.object);
    const prop = match(pattern.property, actual.property);

    if (obj === null || prop === null) {
      return null;
    }

    return { ...obj, ...prop };
  }

  if (t.isCallExpression(pattern) && t.isCallExpression(actual)) {
    const obj = match(pattern.callee, actual.callee);

    if (obj === null) {
      return null;
    }

    if (actual.arguments.length !== pattern.arguments.length) {
      return null;
    }

    const args = pattern.arguments.map((p, i) => match(p, actual.arguments[i]));

    if (args.includes(null)) {
      return null;
    }

    return Object.assign(obj, ...args);
  }

  return null;
};

module.exports = patternStr => actual =>
  match(template.ast(patternStr), actual);
