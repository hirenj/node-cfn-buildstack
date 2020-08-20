const CLOUDFORMATION_SCHEMA = require('cloudformation-js-yaml-schema').CLOUDFORMATION_SCHEMA;

const yaml_include = require('yaml-include');

const yaml = require('js-yaml');

const glob = require('glob');

const fs = require('fs');
const path = require('path');

const { find_keys } = require('./find_keys');

const { enable_cors } = require('./enable_cors');

const { combine_stacks } = require('./combiners');

const { get_git_status } = require('./git');

const STACK_DEFINITION_PATH = path.join(__dirname, '../resources/' ,'stack_definition.yaml');

const YAML_INCLUDE_SCHEMA = yaml_include.YAML_INCLUDE_SCHEMA;

const CFN_SCHEMA = new yaml.Schema({
  include: [ CLOUDFORMATION_SCHEMA, YAML_INCLUDE_SCHEMA ]
});

const REF_TYPE = CLOUDFORMATION_SCHEMA.compiledTypeMap.scalar['!Ref'];

yaml_include.YAML_INCLUDE_SCHEMA = CFN_SCHEMA;

const unique = (o,i,a) => a.indexOf(o) === i;

function find_non_aws_refs(resources) {
  let vals = find_keys('Ref',resources);
  return vals.filter( val => {
    return ! val.match(/^AWS::/);
  }).filter(unique);
}

function fill_parameters(template) {
  let current_params = Object.keys(template.Parameters || {});
  let defined_resources = Object.keys(template.Resources || {}).concat( Object.keys(template.Conditions || {}) );
  let references = find_non_aws_refs(template.Resources);
  current_params.forEach(param => {
    if (defined_resources.indexOf(param) >= 0) {
      delete template.Parameters[param];
    }
  });
  references.forEach( ref => {
    if (defined_resources.indexOf(ref) < 0 && current_params.indexOf(ref) < 0) {
      template.Parameters[ref] = {
        'Type' : 'String',
        'Description': 'Parameter ' +ref
      };
    }
  });
}

function fix_deployment_dependency(template) {
  if ( ! template.Resources.productionDeployment) {
    return;
  }
  let methods = Object.keys(template.Resources).filter( resource =>  template.Resources[resource].Type == 'AWS::ApiGateway::Method' );
  template.Resources.productionDeployment.DependsOn = methods;
}

function readSubstacks(pattern='resources/*.yaml') {
  let stack = yaml.safeLoad(fs.readFileSync(STACK_DEFINITION_PATH));

  let sub_templates = glob.sync(pattern);

  for (let template of sub_templates) {
    let template_string = fs.readFileSync(template);
    let sub_template = yaml.safeLoad(template_string, { schema: CFN_SCHEMA });
    if (sub_template.AWSTemplateFormatVersion === '2010-09-09') {
      combine_stacks(stack,sub_template);
    } else if (sub_template.modules) {
      for (let mod in sub_template.modules) {
        combine_stacks(stack,sub_template.modules[mod]);
      }
    }
  }

  enable_cors(stack);
  return stack;
}

function extractOptionsStack(parent_stack) {
  if ( ! parent_stack.Resources.optionsStack) {
    return;
  }

  let options_stack = yaml.safeLoad(fs.readFileSync(STACK_DEFINITION_PATH));

  for (let key of Object.keys(parent_stack.Resources)) {
    if (parent_stack.Resources[key].Type === 'AWS::ApiGateway::Method' && parent_stack.Resources[key].Properties.HttpMethod == 'OPTIONS') {
      options_stack.Resources[key] = parent_stack.Resources[key];
      delete options_stack.Resources[key].DependsOn;
      delete parent_stack.Resources[key];
    }
  }

  fill_parameters(options_stack);

  if (parent_stack.Resources.optionsStack) {
    for (let key of Object.keys(options_stack.Parameters)) {
      parent_stack.Resources.optionsStack.Properties.Parameters[key] = REF_TYPE.construct(key);
    }
  }

  return options_stack;
}

function constructIAMUsersStack(parent_stack,pattern='resources/iam_users/*.yaml') {
  if (! parent_stack.Resources.usersStack) {
    return;
  }

  let users_stack = yaml.safeLoad(fs.readFileSync(STACK_DEFINITION_PATH));

  for (let template of glob.sync(pattern)) {
    let template_string = fs.readFileSync(template);
    let sub_template = yaml.safeLoad(template_string, { schema: CFN_SCHEMA });
    if (sub_template.AWSTemplateFormatVersion === '2010-09-09') {
      combine_stacks(users_stack,sub_template);
    } else if (sub_template.modules) {
      for (let mod in sub_template.modules) {
        combine_stacks(users_stack,sub_template.modules[mod]);
      }
    }
  }

  fill_parameters(users_stack);

  for (let key of Object.keys(users_stack.Parameters)) {
    if ( ! parent_stack.Resources.usersStack.Properties.Parameters[key] ) {
      parent_stack.Resources.usersStack.Properties.Parameters[key] = REF_TYPE.construct(key);
    }
  }

  return users_stack;
}

function buildStack() {

  let stack = readSubstacks();

  let options_stack = extractOptionsStack(stack);

  let users_stack = constructIAMUsersStack(stack);

  fill_parameters(stack);

  fix_deployment_dependency(stack);

  return { stack, options_stack, users_stack };
}

function createStacks(stackName='Stack',outputpath='') {
  return get_git_status().catch( err => {
    if (err.message.indexOf('fatal: No names found, cannot describe anything') >= 0 ) {
      return '';      
    } else {
      throw err;
    }
  }).then( git_status => {

    let {stack, options_stack, users_stack} = buildStack();

    let status = git_status ? ' '+git_status.replace(/-0-[^-]+$/,'') : '';

    stack.Description = `${stackName}${status}`;

    if (options_stack) {
      options_stack.Description = `${stackName} API options${status}`;
    }

    if (users_stack) {
      users_stack.Description = `${stackName} IAM users${status}`;
    }

    let clean_filename = stack.Description.replace(/[^A-Za-z0-9_\-]/g,'_');

    let users_filename = `${clean_filename.replace(stackName,`${stackName}_users`)}.template`;
    let options_filename = `${clean_filename.replace(stackName,`${stackName}_options`)}.template`;
    for (let [entry, substack] of Object.entries(stack.Resources).filter( ([entry,]) => { return ['optionsStack','usersStack'].indexOf(entry) >= 0; } ) ) {
      switch (entry) {
        case 'optionsStack':
          substack.Properties.TemplateURL.data = substack.Properties.TemplateURL.data.replace(/\/[^\/]+.template$/, `/${options_filename}` );
          break;
        case 'usersStack':
          substack.Properties.TemplateURL.data = substack.Properties.TemplateURL.data.replace(/\/[^\/]+.template$/, `/${users_filename}` );
          break;
      }
    }

    let generated_yaml_string = yaml.safeDump(stack, {schema: CLOUDFORMATION_SCHEMA });

    fs.writeFileSync(path.join(outputpath,`${clean_filename}.template`),generated_yaml_string);

    if (options_stack) {
      fs.writeFileSync(path.join(outputpath,options_filename), yaml.safeDump(options_stack, {schema: CLOUDFORMATION_SCHEMA }));
    }

    if (users_stack) {
      fs.writeFileSync(path.join(outputpath,users_filename), yaml.safeDump(users_stack, {schema: CLOUDFORMATION_SCHEMA }));
    }

    return `${clean_filename}.template`;

  });
}

module.exports = { createStacks };