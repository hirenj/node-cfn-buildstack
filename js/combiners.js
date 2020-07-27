const combine_resources = (curr,prev) => {
  Object.keys(curr).forEach(function(key) {
    if (prev[key] && prev[key].Type == 'AWS::S3::Bucket') {
      let wanted = null;
      let alternative = null;
      if (prev[key].Properties.BucketName) {
        wanted = prev[key];
        alternative = curr[key];
      }
      if (curr[key].Properties.BucketName) {
        wanted = curr[key];
        alternative = prev[key];
      }
      prev[key] = wanted;
      if (! wanted.Properties.NotificationConfiguration && alternative.Properties.NotificationConfiguration ) {
        wanted.Properties.NotificationConfiguration = {}
      }
      wanted.Properties.NotificationConfiguration.LambdaConfigurations = (wanted.Properties.NotificationConfiguration.LambdaConfigurations || []).concat( alternative.Properties.NotificationConfiguration.LambdaConfigurations );
      wanted.DependsOn = (wanted.DependsOn || []).concat(alternative.DependsOn)
      curr[key] = prev[key];
    }
    if (prev[key] && prev[key].Type == 'AWS::SNS::Topic') {
      curr[key].Properties.Subscription = curr[key].Properties.Subscription.concat(prev[key].Properties.Subscription);
    }
    prev[key] = curr[key];
  });
  return prev;
};

const combine_stacks = (stack, sub_template) => {
  stack.Parameters = Object.assign(sub_template.Parameters || {},stack.Parameters);
  stack.Conditions = Object.assign(sub_template.Conditions || {},stack.Conditions);
  stack.Resources = combine_resources(sub_template.Resources || {},stack.Resources);
  stack.Outputs = Object.assign(sub_template.Outputs || {},stack.Outputs);
};

module.exports = { combine_stacks };