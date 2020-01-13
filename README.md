# Serverless CloudFront - Lambda@edge Plugin

[![NPM version][npm-image]][npm-url]
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

This is a Serverless Framework Plugin to easily deploy Lambda@Edge functions to an existing CloudFront Distribution. This Plugin doesn't require the CloudFront Distribution to be under the same CloudFormation Stack. But it does require for the Serverless user role to have permissions to modify the target Distribution.

If the CloudFront Distribution is in the same CloudFormation stack and is being managed by other Serverless plugin, maybe [this other plugin is better](https://github.com/silvermine/serverless-plugin-cloudfront-lambda-edge) for you.

**Note: In it's current state this plugin overwrites the Lambda Associations and the whitelisted cookies if configured. Please take this into account to prevent overwriting previous configurations.**

### Installation

Install as a Dev. Dependency using NPM:

```
$ npm install --save-dev serverless-cloudfront-plugin
```

Or manually link the plugin project to your project:

* Clone this repository
* [Link the plugin using NPM](https://docs.npmjs.com/cli/link) to your project

### How to use?

In your `serverless.yml` file, configure the deployment rules of the Lambda@Edge functions on CloudFront.
1. Add the Plugin to the plugins configuration.
2. In the custom field, add a `cloudfront` object, with a `distributionId` and `behaviors` fields.
3. Use the same function name in the behaviors section, as specified in the functions configuration.
```yaml
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
    * Headers
    * Query strings
    * Etc.
* Specify multiple distributions

## License

MIT

[npm-image]: https://badge.fury.io/js/serverless-cloudfront-plugin.svg
[npm-url]: https://npmjs.com/package/serverless-cloudfront-plugin
