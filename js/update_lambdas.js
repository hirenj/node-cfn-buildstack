const fs = require('fs');

const { write_cfn, load_cfn, REF_TYPE } = require('./cfn_yaml');

function readLambdaMap(lambdasdir) {
  let lambdas = fs.readdirSync(lambdasdir).filter(file => file.endsWith('zip'));
  let lambda_map = new Map();
  lambdas.forEach( lambdafile => {
    let [func,] = lambdafile.split('-');
    lambda_map.set(func,lambdafile);
  });
  return lambda_map;  
}

function updateLambdas(template,lambdasdir) {
  let lambdas = readLambdaMap(lambdasdir);
  let stack = load_cfn(fs.readFileSync(template));
  for (const [func, filename] of lambdas.entries()) {
    if (! stack.Resources[func]) {
      continue;
    }
    let codedef = stack.Resources[func].Properties.Code;
    stack.Resources[func].Properties.Description = 'cfn_'+filename.split('-').slice(1).join('-').replace('.zip','');
    delete codedef.ZipFile;
    codedef.S3Bucket = REF_TYPE.construct('codebucket');
    codedef.S3Key = `lambdas/${filename}`;
  }
  fs.writeFileSync(template, write_cfn(stack));
}

module.exports = { updateLambdas };