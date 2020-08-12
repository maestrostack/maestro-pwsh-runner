const stackManager = require('./index');

process.on('message', async (stack) => {
  const outcome = await stackManager.tfApply(stack);

  process.send({ code: outcome.code, stdout: outcome.stdout, stderr: outcome.stderr });
});
