# Serverless CloudFront - Lambda@edge Plugin

[![NPM version][npm-image]][npm-url]
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

This is a Serverless Framework Plugin to easily deploy Lambda@Edge functions to an existing CloudFront Distribution. This Plugin doesn't require the CloudFront Distribution to be under the same CloudFormation Stack. But it does require for the Serverless user role to have permissions to modify the target Distribution.

If the CloudFront Distribution is in the same CloudFormation stack and is being managed by other Serverless plugin, maybe [this other plugin is better](https://github.com/silvermine/serverless-plugin-cloudfront-lambda-edge) for you.

**Note: In it's current state this plugin overwrites the Lambda Associations and the whitelisted cookies if configured. Please take this into account to prevent overwriting previous configurations.**

### Installation

Install using NPM:

```
$ npm install serverless-cloudfront-plugin
```

Or

* Clone this repository
* [Link using NPM](https://docs.npmjs.com/cli/link), the plugin to the project that will use it

### How to use?

In your `serverless.yml` file, configure the deployment rules of the lambda@edge functions on CloudFront.
* Add the Plugin to the plugins configuration.
* In the custom field, add a `cloudfront` object, and add the `distributionId` and the `behaviors` rules.
* Use the same function name in the behaviors section, as specified in the functions configuration.
```
service: my-awesome-service
plugins:
  ...
  - serverless-cloudfront-plugin
...
functions:
  function1:
    handler: function1.run
    ...
  function2:
    handler: function2.run
    ...
custom:
  ...
  cloudfront:
    distributionId: EABC123DEF456
    behaviors: 
      foo/bar:
        cookies:
         - cookie1
         - cookie2
        lambdaAssociations:
          viewerRequest : function1
          viewerResponse: function2
      foo/bar/lol:
        lambdaAssociations:
          viewerRequest : function1
      foo/*:
        cookies:
         - cookie3
        lambdaAssociations:
          viewerResponse: function2
```

### To-Do

* Allow to pass other Cloudfront behavior configurations
* Auto-create behaviors if they don't exist

## License

MIT

[npm-image]: https://badge.fury.io/js/serverless-cloudfront-plugin.svg
[npm-url]: https://npmjs.com/package/serverless-cloudfront-plugin
