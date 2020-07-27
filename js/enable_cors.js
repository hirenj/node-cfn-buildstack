const REF_TYPE = require('cloudformation-js-yaml-schema').CLOUDFORMATION_SCHEMA.compiledTypeMap.scalar['!Ref'];

function make_cors(resources,method) {
  let resource  = resources[method];
  resource.Properties.Integration.IntegrationResponses.forEach(int_resp => {
    int_resp.ResponseParameters = int_resp.ResponseParameters || {};
    int_resp.ResponseParameters['method.response.header.Access-Control-Allow-Origin'] = ''*'';
  });
  resource.Properties.MethodResponses.forEach( method_resp => {
    method_resp.ResponseParameters = method_resp.ResponseParameters || {};
    method_resp.ResponseParameters['method.response.header.Access-Control-Allow-Origin'] = true;
  });
}

function enable_cors(template) {
  let resources = Object.keys(template.Resources);
  let methods = resources.filter(function(res) { return template.Resources[res].Type === 'AWS::ApiGateway::Method'; });

  methods.forEach(function(method) {
    make_cors(template.Resources,method);
    let resource = template.Resources[method];
    if (resource.Properties.HttpMethod === 'HEAD') {
      return;
    }
    let method_base = method.replace(/POST/,'').replace(/GET/,'');
    if (template.Resources[method_base+'OPTIONS']) {
      return;
    }
    let options_method = JSON.parse(JSON.stringify(resource));
    options_method.Properties.RestApiId = REF_TYPE.construct(options_method.Properties.RestApiId.data);
    options_method.Properties.ResourceId = REF_TYPE.construct(options_method.Properties.ResourceId.data);
    options_method.Properties.HttpMethod = 'OPTIONS';
    if (options_method.Properties.RequestParameters) {
      delete options_method.Properties.RequestParameters['method.request.header.Authorization'];
    }
    delete options_method.Properties.ApiKeyRequired;
    options_method.Properties.Integration = {'Type' : 'MOCK'};
    options_method.Properties.Integration.RequestTemplates = { 'application/json' : '{\'statusCode\': 200}' };
    options_method.Properties.Integration.IntegrationResponses = [
    {
      'ResponseParameters': {
        'method.response.header.Access-Control-Allow-Origin': '\'*\'',
        'method.response.header.Access-Control-Allow-Headers' : '\'Content-Type,X-Amz-Date,Authorization,X-Api-Key\'',
        'method.response.header.Access-Control-Allow-Credentials' : '\'true\'',
        'method.response.header.Access-Control-Allow-Max-Age' : '\'1800\'',
        'method.response.header.Access-Control-Allow-Expose-Headers' : '\'\'',
        'method.response.header.Access-Control-Allow-Methods' : '\''+resource.Properties.HttpMethod+',OPTIONS\''
      },
      'ResponseTemplates': { 'application/json' : '' },
      'StatusCode': 200
    }];
    options_method.Properties.MethodResponses = [
    {
      'ResponseParameters': {
        'method.response.header.Access-Control-Allow-Origin': true,
        'method.response.header.Access-Control-Allow-Headers': true,
        'method.response.header.Access-Control-Allow-Credentials': true,
        'method.response.header.Access-Control-Allow-Max-Age': true,
        'method.response.header.Access-Control-Allow-Expose-Headers': true,
        'method.response.header.Access-Control-Allow-Methods': true
      },
      'StatusCode': 200
    }];
    options_method.Properties.AuthorizationType = 'NONE';
    delete options_method.Properties.AuthorizerId;
    template.Resources[method_base+'OPTIONS'] = options_method;
  });
}

module.exports = { enable_cors };