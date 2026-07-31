// Acme: never log PII. The lesson that produced this rule is docs/design-docs/lessons/.
// Prose explains; this fails the build.
module.exports = {
  meta: { type: "problem", docs: { description: "no PII in log calls" }, schema: [] },
  create(context) {
    const BANNED = /\b(email|phone|fullName|ssn)\b/;
    return {
      CallExpression(node) {
        const callee = context.sourceCode.getText(node.callee);
        if (!/^(logger|console)\./.test(callee)) return;
        for (const arg of node.arguments) {
          if (BANNED.test(context.sourceCode.getText(arg))) {
            context.report({ node: arg, message: "Acme: do not log PII — use the user id." });
          }
        }
      },
    };
  },
};
