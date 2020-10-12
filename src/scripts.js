const t = require('@babel/types');
const { default: template } = require('@babel/template');
const pattern = require('./pattern');

const applyTemplate = temp =>
  typeof temp === 'string' ? template(temp, { awaitOutsideAsync: true }) : temp;

const withAwait = temp => props => {
  const expression = applyTemplate(temp)(props).expression;
  return t.expressionStatement(t.awaitExpression(expression));
};

const withMakeAsync = param => temp => props =>
  applyTemplate(temp)({ ...props, [param]: { ...props[param], async: true } });

const SUBSTITUTIONS = {
  'pm.test(X, Y)': withMakeAsync('Y')('it(X, Y)'),
  'pm.environment': 'environment',
  'pm.environment.unset': 'environment.delete',
  'pm.expect(X).A.B.C': 'expect(X).A.B.C',
  'pm.expect(X).A.B': 'expect(X).A.B',
  'pm.expect(X).A': 'expect(X).A',
  'pm.expect(X).A.B(Y)': 'expect(X).A.B(Y)',
  'pm.response.json()': 'json',
  'pm.response.to.X': withAwait('expect(response).to.X'),
  'pm.response.to.X()': withAwait('expect(response).to.X()'),
  'pm.response.to.X.Y': withAwait('expect(response).to.X.Y'),
  'pm.response.to.X.Y()': withAwait('expect(response).to.X.Y()'),
  'pm.response.to.X.Y(P)': withAwait('expect(response).to.X.Y(P)'),
  'pm.response.to.X.Y.Z': withAwait('expect(response).to.X.Y.Z'),
  'pm.response.to.X.Y.Z()': withAwait('expect(response).to.X.Y.Z()'),
  'pm.response.to.X.Y.Z(P)': withAwait('expect(response).to.X.Y.Z(P)'),
};

const visitor = {
  enter(path) {
    for (const substitution of Object.keys(SUBSTITUTIONS)) {
      const match = pattern(substitution)(path.node);
      const temp = applyTemplate(SUBSTITUTIONS[substitution]);

      if (match !== null) {
        const replacement = temp(match);
        path.replaceWith(replacement);
        return;
      }
    }
  },
};

module.exports = visitor;
