const CLOUDFORMATION_SCHEMA = require('cloudformation-js-yaml-schema').CLOUDFORMATION_SCHEMA;

const yaml_include = require('yaml-include');

const yaml = require('js-yaml');

const YAML_INCLUDE_SCHEMA = yaml_include.YAML_INCLUDE_SCHEMA;

const CFN_SCHEMA = new yaml.Schema({
  include: [ CLOUDFORMATION_SCHEMA, YAML_INCLUDE_SCHEMA ]
});

const REF_TYPE = CLOUDFORMATION_SCHEMA.compiledTypeMap.scalar['!Ref'];

yaml_include.YAML_INCLUDE_SCHEMA = CFN_SCHEMA;


function load_cfn(string_yaml) {
  return yaml.safeLoad(string_yaml,{ schema: CFN_SCHEMA });
}

function write_cfn(cfn) {
  return yaml.safeDump(cfn, {schema: CLOUDFORMATION_SCHEMA });
}


module.exports = { REF_TYPE, load_cfn, write_cfn };